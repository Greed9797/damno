// ══════════════════════════════════════════════════════════════
// Injector — finds Roblox, injects payload DLL
// Mac arm64 target
// ══════════════════════════════════════════════════════════════

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/proc.h>
#include <sys/sysctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <mach/mach.h>
#include <mach/mach_traps.h>
#include <mach/mach_vm.h>
#include <mach/thread_act.h>
#include <mach/thread_status.h>
#include <libproc.h>
#include <signal.h>
#include <pthread.h>
#include <string>
#include <vector>
#include <iostream>
#include <thread>
#include <atomic>
#include <chrono>

#include "common.h"

// ══════════════════════════════════════════════════════════════
// Process Finding
// ══════════════════════════════════════════════════════════════

struct ProcessInfo {
    pid_t pid;
    std::string name;
    std::string path;
};

std::vector<ProcessInfo> EnumerateProcesses() {
    std::vector<ProcessInfo> procs;
    int maxprocs = proc_listpids(PROC_ALL_PIDS, 0, nullptr, 0);
    if (maxprocs <= 0) return procs;
    
    std::vector<pid_t> pids(maxprocs);
    int nbytes = proc_listpids(PROC_ALL_PIDS, 0, pids.data(), maxprocs * sizeof(pid_t));
    int count = nbytes / sizeof(pid_t);
    
    for (int i = 0; i < count; i++) {
        if (pids[i] <= 0) continue;
        
        char name[PROC_PIDPATHINFO_MAXSIZE] = {0};
        int namelen = proc_name(pids[i], name, sizeof(name));
        if (namelen <= 0) continue;
        
        char path[PROC_PIDPATHINFO_MAXSIZE] = {0};
        proc_pidpath(pids[i], path, sizeof(path));
        
        ProcessInfo info;
        info.pid = pids[i];
        info.name = name;
        info.path = path;
        procs.push_back(info);
    }
    
    return procs;
}

uint32_t FindRobloxPID() {
    auto procs = EnumerateProcesses();
    for (auto& p : procs) {
        // Match RobloxPlayer or RobloxPlayerBeta
        if (strstr(p.name.c_str(), "RobloxPlayer") ||
            strstr(p.path.c_str(), "RobloxPlayer")) {
            printf("[*] Found Roblox: pid=%d name=%s\n", p.pid, p.name.c_str());
            return p.pid;
        }
    }
    return 0;
}

// ══════════════════════════════════════════════════════════════
// Mach Injection
// ══════════════════════════════════════════════════════════════

class MachInjector {
public:
    MachInjector(pid_t target_pid) : target_pid_(target_pid), task_(MACH_PORT_NULL) {}
    
    bool Attach() {
        kern_return_t kr = task_for_pid(mach_task_self(), target_pid_, &task_);
        if (kr != KERN_SUCCESS) {
            fprintf(stderr, "[!] task_for_pid failed: %s (0x%x)\n",
                    mach_error_string(kr), kr);
            fprintf(stderr, "[!] Need: sudo, or Developer Tools entitlement\n");
            return false;
        }
        printf("[+] Attached to task: 0x%x\n", task_);
        return true;
    }
    
    bool Inject(const std::string& dll_path) {
        if (task_ == MACH_PORT_NULL) return false;
        
        // Method 1: DYLD insert via environment (simplest)
        // This works when SIP allows and process isn't hardened
        if (InjectViaDyldEnv(dll_path)) {
            return true;
        }
        
        // Method 2: Remote thread + dlopen
        if (InjectViaRemoteThread(dll_path)) {
            return true;
        }
        
        // Method 3: Shellcode injection
        if (InjectViaShellcode(dll_path)) {
            return true;
        }
        
        fprintf(stderr, "[!] All injection methods failed\n");
        return false;
    }
    
    void Detach() {
        if (task_ != MACH_PORT_NULL) {
            mach_port_deallocate(mach_task_self(), task_);
            task_ = MACH_PORT_NULL;
        }
    }
    
private:
    pid_t target_pid_;
    mach_port_t task_;
    
    // DYLD environment injection — restart-based
    bool InjectViaDyldEnv(const std::string& dll_path) {
        // For processes we can restart with DYLD_INSERT_LIBRARIES
        // This requires the process to not have hardened runtime
        
        // Check if target has hardened runtime
        // For now, we'll try the approach
        
        printf("[*] Attempting DYLD insert injection...\n");
        
        // Build command to restart Roblox with DYLD_INSERT_LIBRARIES
        char cmd[1024];
        snprintf(cmd, sizeof(cmd),
            "DYLD_INSERT_LIBRARIES='%s' DYLD_FORCE_FLAT_NAMESPACE=0 "
            "'%s' &",
            dll_path.c_str(),
            "/Applications/Roblox.app/Contents/MacOS/RobloxPlayer");
        
        printf("[*] Command: %s\n", cmd);
        int ret = system(cmd);
        return ret == 0;
    }
    
    // Remote thread injection — find libc dlopen, call it remotely
    bool InjectViaRemoteThread(const std::string& dll_path) {
        printf("[*] Attempting remote thread injection...\n");
        
        // Step 1: Find dlopen in target process
        mach_vm_address_t dlopen_addr = FindDLOpenInTarget();
        if (dlopen_addr == 0) {
            fprintf(stderr, "[!] Could not find dlopen in target\n");
            return false;
        }
        printf("[+] Found dlopen at: 0x%llx\n", (unsigned long long)dlopen_addr);
        
        // Step 2: Allocate memory in target for dll path string
        mach_vm_size_t path_size = dll_path.size() + 1;
        mach_vm_address_t remote_path = 0;
        kern_return_t kr = mach_vm_allocate(task_, &remote_path, path_size,
                                            VM_FLAGS_ANYWHERE);
        if (kr != KERN_SUCCESS) {
            fprintf(stderr, "[!] mach_vm_allocate failed: %s\n", mach_error_string(kr));
            return false;
        }
        
        // Step 3: Write dll path to target memory
        kr = mach_vm_write(task_, remote_path,
                          (vm_offset_t)dll_path.c_str(), path_size);
        if (kr != KERN_SUCCESS) {
            fprintf(stderr, "[!] mach_vm_write failed: %s\n", mach_error_string(kr));
            mach_vm_deallocate(task_, remote_path, path_size);
            return false;
        }
        
        // Step 4: Create remote thread calling dlopen(path, RTLD_NOW)
        // RTLD_NOW = 2
        thread_act_t remote_thread = 0;
        kr = CreateRemoteThread(dlopen_addr, remote_path, 2, &remote_thread);
        if (kr != KERN_SUCCESS) {
            fprintf(stderr, "[!] CreateRemoteThread failed: %s\n", mach_error_string(kr));
            mach_vm_deallocate(task_, remote_path, path_size);
            return false;
        }
        
        // Step 5: Wait for thread to complete
        usleep(500000); // 500ms
        
        printf("[+] Injection thread created: 0x%x\n", remote_thread);
        
        // Cleanup path memory (thread should have copied it)
        // Don't deallocate yet — give time for dlopen to read it
        usleep(1000000); // 1s
        
        return true;
    }
    
    // Shellcode injection — more reliable but complex
    bool InjectViaShellcode(const std::string& dll_path) {
        printf("[*] Attempting shellcode injection...\n");
        
        // For arm64, shellcode calls dlopen
        // Build shellcode that:
        // 1. Loads dll path address into x0
        // 2. Loads RTLD_NOW into x1  
        // 3. Calls dlopen
        // 4. Returns
        
        // Allocate memory for shellcode + path
        mach_vm_size_t total_size = 4096 + dll_path.size() + 1;
        mach_vm_address_t remote_mem = 0;
        kern_return_t kr = mach_vm_allocate(task_, &remote_mem, total_size,
                                            VM_FLAGS_ANYWHERE);
        if (kr != KERN_SUCCESS) return false;
        
        // Write dll path after shellcode area
        mach_vm_address_t remote_path = remote_mem + 4096;
        kr = mach_vm_write(task_, remote_path,
                          (vm_offset_t)dll_path.c_str(), dll_path.size() + 1);
        if (kr != KERN_SUCCESS) {
            mach_vm_deallocate(task_, remote_mem, total_size);
            return false;
        }
        
        // Build arm64 shellcode — placeholder, real impl needs address patching
        printf("[*] Shellcode injection requires address patching\n");
        printf("[*] Falling back to restart method\n");
        
        mach_vm_deallocate(task_, remote_mem, total_size);
        return InjectViaDyldEnv(dll_path);
    }
    
    // Find dlopen address in target process via dyld info
    mach_vm_address_t FindDLOpenInTarget() {
        // Read target's dyld shared cache or symbol tables
        // Simplified: return known offset from base
        
        // Get target's base address
        mach_vm_address_t base = GetTargetBaseAddress();
        if (base == 0) return 0;
        
        // For arm64 Mac, dlopen offset varies by OS version
        // We'd need to parse target's memory for symbol
        // For now, use a common offset (will need updating per macOS version)
        
        // macOS 14/15 arm64 dlopen in libdyld.dylib
        // This is version-specific — needs runtime resolution
        
        printf("[*] Target base: 0x%llx\n", (unsigned long long)base);
        
        // TODO: Parse target's dyld info to find dlopen
        // For now return 0 to trigger fallback
        return 0;
    }
    
    mach_vm_address_t GetTargetBaseAddress() {
        struct proc_regioninfo ri;
        
        if (proc_pidinfo(target_pid_, PROC_PIDREGIONINFO, 0,
                        &ri, sizeof(ri)) == sizeof(ri)) {
            return ri.pri_address;
        }
        return 0;
    }
    
    kern_return_t CreateRemoteThread(mach_vm_address_t entry,
                                     mach_vm_address_t arg1,
                                     uint64_t arg2,
                                     thread_act_t* out_thread) {
        // Create thread in target process
        // arm64 calling convention: x0, x1, x2...
        
        arm_thread_state64_t state = {};
        arm_thread_state64_set_pc_fptr(state, (void*)entry);
        // x0 = arg1 (dll path)
        state.__x[0] = arg1;
        // x1 = arg2 (RTLD_NOW)
        state.__x[1] = arg2;
        
        thread_act_t thread = 0;
        kern_return_t kr = thread_create_running(
            task_,
            ARM_THREAD_STATE64,
            (thread_state_t)&state,
            ARM_THREAD_STATE64_COUNT,
            &thread
        );
        
        if (kr == KERN_SUCCESS) {
            *out_thread = thread;
        }
        
        return kr;
    }
};

// ══════════════════════════════════════════════════════════════
// IPC Server — communicates with payload DLL
// ══════════════════════════════════════════════════════════════

class IPCServer {
public:
    IPCServer() : server_fd_(-1), running_(false) {}
    
    bool Start() {
        // Remove old socket
        unlink(EXECUTOR_SOCKET_PATH);
        
        server_fd_ = socket(AF_UNIX, SOCK_STREAM, 0);
        if (server_fd_ < 0) {
            perror("[!] socket");
            return false;
        }
        
        struct sockaddr_un addr = {};
        addr.sun_family = AF_UNIX;
        strncpy(addr.sun_path, EXECUTOR_SOCKET_PATH, sizeof(addr.sun_path) - 1);
        
        if (bind(server_fd_, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
            perror("[!] bind");
            close(server_fd_);
            return false;
        }
        
        if (listen(server_fd_, 1) < 0) {
            perror("[!] listen");
            close(server_fd_);
            return false;
        }
        
        printf("[+] IPC server listening on %s\n", EXECUTOR_SOCKET_PATH);
        running_ = true;
        
        // Accept connections in background
        accept_thread_ = std::thread([this]() { AcceptLoop(); });
        
        return true;
    }
    
    void Stop() {
        running_ = false;
        if (server_fd_ >= 0) {
            close(server_fd_);
            server_fd_ = -1;
        }
        if (accept_thread_.joinable()) {
            accept_thread_.join();
        }
        unlink(EXECUTOR_SOCKET_PATH);
    }
    
    bool SendScript(const std::string& script) {
        if (client_fd_ < 0) return false;
        
        MessageHeader hdr = {};
        hdr.type = MsgType::EXECUTE_SCRIPT;
        hdr.payload_size = script.size();
        hdr.sequence = ++seq_;
        
        if (send(client_fd_, &hdr, sizeof(hdr), 0) < 0) return false;
        if (send(client_fd_, script.c_str(), script.size(), 0) < 0) return false;
        
        return true;
    }
    
    bool IsConnected() const { return client_fd_ >= 0; }
    
private:
    int server_fd_;
    int client_fd_ = -1;
    bool running_;
    uint32_t seq_ = 0;
    std::thread accept_thread_;
    
    void AcceptLoop() {
        while (running_) {
            struct timeval tv = {};
            tv.tv_sec = 1;
            tv.tv_usec = 0;
            
            fd_set fds;
            FD_ZERO(&fds);
            FD_SET(server_fd_, &fds);
            
            int ret = select(server_fd_ + 1, &fds, nullptr, nullptr, &tv);
            if (ret <= 0) continue;
            
            int client = accept(server_fd_, nullptr, nullptr);
            if (client < 0) continue;
            
            printf("[+] Payload connected!\n");
            client_fd_ = client;
            
            // Handle this client
            HandleClient(client);
            
            close(client);
            client_fd_ = -1;
            printf("[*] Payload disconnected\n");
        }
    }
    
    void HandleClient(int fd) {
        // Send initial state
        ExecutorOptions opts = GetDefaultOptions();
        MessageHeader hdr = {};
        hdr.type = MsgType::SET_OPTION;
        hdr.payload_size = sizeof(opts);
        hdr.sequence = ++seq_;
        send(fd, &hdr, sizeof(hdr), 0);
        send(fd, &opts, sizeof(opts), 0);
        
        // Receive loop
        while (running_) {
            MessageHeader msg_hdr;
            ssize_t n = recv(fd, &msg_hdr, sizeof(msg_hdr), MSG_WAITALL);
            if (n <= 0) break;
            
            switch (msg_hdr.type) {
                case MsgType::READY:
                    printf("[+] Payload ready!\n");
                    break;
                    
                case MsgType::PONG:
                    printf("[+] Payload alive\n");
                    break;
                    
                case MsgType::SCRIPT_RESULT: {
                    char* buf = (char*)malloc(msg_hdr.payload_size);
                    recv(fd, buf, msg_hdr.payload_size, MSG_WAITALL);
                    printf("[Payload] %.*s\n", msg_hdr.payload_size, buf);
                    free(buf);
                    break;
                }
                    
                case MsgType::SCRIPT_ERROR: {
                    char* buf = (char*)malloc(msg_hdr.payload_size);
                    recv(fd, buf, msg_hdr.payload_size, MSG_WAITALL);
                    fprintf(stderr, "[Payload ERROR] %.*s\n", msg_hdr.payload_size, buf);
                    free(buf);
                    break;
                }
                    
                case MsgType::LOG: {
                    char* buf = (char*)malloc(msg_hdr.payload_size);
                    recv(fd, buf, msg_hdr.payload_size, MSG_WAITALL);
                    printf("[Log] %.*s\n", msg_hdr.payload_size, buf);
                    free(buf);
                    break;
                }
                    
                default:
                    break;
            }
        }
    }
};

// ══════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════

void PrintBanner() {
    printf("\n");
    printf("╔══════════════════════════════════════════════╗\n");
    printf("║     ROBLOX EXECUTOR FRAMEWORK v1.0           ║\n");
    printf("║     Mac arm64 | REA Mapped                   ║\n");
    printf("╚══════════════════════════════════════════════╝\n\n");
}

int main(int argc, char* argv[]) {
    PrintBanner();
    
    std::string dll_path = "./payload.dylib";
    bool auto_inject = true;
    
    // Parse args
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--dll") == 0 && i + 1 < argc) {
            dll_path = argv[++i];
        } else if (strcmp(argv[i], "--no-inject") == 0) {
            auto_inject = false;
        } else if (strcmp(argv[i], "--help") == 0) {
            printf("Usage: %s [--dll path] [--no-inject]\n", argv[0]);
            return 0;
        }
    }
    
    // Start IPC server
    IPCServer ipc;
    if (!ipc.Start()) {
        fprintf(stderr, "[!] Failed to start IPC server\n");
        return 1;
    }
    
    // Find and inject
    if (auto_inject) {
        printf("[*] Searching for Roblox process...\n");
        uint32_t pid = FindRobloxPID();
        
        if (pid == 0) {
            fprintf(stderr, "[!] Roblox not found. Start Roblox first.\n");
            fprintf(stderr, "[*] Waiting for Roblox to start...\n");
            
            // Wait for Roblox
            while (pid == 0) {
                sleep(2);
                pid = FindRobloxPID();
            }
        }
        
        printf("[*] Injecting into PID %d...\n", pid);
        
        MachInjector injector(pid);
        if (!injector.Attach()) {
            fprintf(stderr, "[!] Failed to attach to process\n");
            fprintf(stderr, "[*] Try: sudo ./injector\n");
            fprintf(stderr, "[*] Or enable Developer Tools for terminal\n");
            
            // Still run — payload might connect via other means
            printf("[*] Running in server-only mode...\n");
        } else {
            if (!injector.Inject(dll_path)) {
                fprintf(stderr, "[!] Injection failed\n");
            } else {
                printf("[+] Injection successful!\n");
            }
            injector.Detach();
        }
    }
    
    // Interactive mode
    printf("\n[*] Ready. Type 'help' for commands.\n\n");
    
    std::string line;
    while (true) {
        printf("exec> ");
        fflush(stdout);
        
        if (!std::getline(std::cin, line)) break;
        
        if (line == "help" || line == "h") {
            printf("Commands:\n");
            printf("  execute <script>  - Execute Lua script\n");
            printf("  exec <file>       - Execute script from file\n");
            printf("  ping              - Check payload status\n");
            printf("  inject            - Re-inject payload\n");
            printf("  quit              - Exit\n");
        } else if (line == "ping") {
            if (ipc.IsConnected()) {
                printf("[+] Payload connected\n");
            } else {
                printf("[!] Payload not connected\n");
            }
        } else if (line == "quit" || line == "exit") {
            break;
        } else if (line.substr(0, 8) == "execute ") {
            std::string script = line.substr(8);
            if (ipc.SendScript(script)) {
                printf("[*] Script sent\n");
            } else {
                printf("[!] Failed to send (payload not connected)\n");
            }
        } else if (line.substr(0, 5) == "exec ") {
            std::string filepath = line.substr(5);
            std::string content = ReadFile(filepath);
            if (!content.empty()) {
                if (ipc.SendScript(content)) {
                    printf("[*] File sent: %s\n", filepath.c_str());
                } else {
                    printf("[!] Failed to send\n");
                }
            } else {
                printf("[!] Could not read file: %s\n", filepath.c_str());
            }
        } else if (!line.empty()) {
            // Treat as script
            if (ipc.SendScript(line)) {
                printf("[*] Sent\n");
            } else {
                printf("[!] Not connected\n");
            }
        }
    }
    
    ipc.Stop();
    printf("[*] Goodbye\n");
    return 0;
}

// ══════════════════════════════════════════════════════════════
// File utilities
// ══════════════════════════════════════════════════════════════

std::string ReadFile(const std::string& path) {
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) return "";
    
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    
    std::string content(size, 0);
    fread(&content[0], 1, size, f);
    fclose(f);
    
    return content;
}

bool WriteFile(const std::string& path, const std::string& content) {
    FILE* f = fopen(path.c_str(), "wb");
    if (!f) return false;
    
    fwrite(content.data(), 1, content.size(), f);
    fclose(f);
    
    return true;
}
