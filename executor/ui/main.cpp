// ══════════════════════════════════════════════════════════════
// Terminal UI — simple script manager
// ══════════════════════════════════════════════════════════════

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <dirent.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <string>
#include <vector>
#include <iostream>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <atomic>
#include <thread>
#include <chrono>

#include "common.h"

// ══════════════════════════════════════════════════════════════
// ANSI Colors
// ══════════════════════════════════════════════════════════════

#define CLR_RESET   "\033[0m"
#define CLR_BOLD    "\033[1m"
#define CLR_DIM     "\033[2m"
#define CLR_RED     "\033[31m"
#define CLR_GREEN   "\033[32m"
#define CLR_YELLOW  "\033[33m"
#define CLR_BLUE    "\033[34m"
#define CLR_MAGENTA "\033[35m"
#define CLR_CYAN    "\033[36m"
#define CLR_WHITE   "\033[37m"
#define CLR_BG_GREEN "\033[42m"

// ══════════════════════════════════════════════════════════════
// Script Library
// ══════════════════════════════════════════════════════════════

struct ScriptEntry {
    std::string name;
    std::string path;
    std::string content;
    size_t size;
};

class ScriptLibrary {
public:
    bool LoadFromDir(const std::string& dir) {
        scripts_.clear();
        base_dir_ = dir;
        
        DIR* d = opendir(dir.c_str());
        if (!d) return false;
        
        struct dirent* entry;
        while ((entry = readdir(d)) != nullptr) {
            std::string name = entry->d_name;
            if (name == "." || name == "..") continue;
            
            std::string path = dir + "/" + name;
            struct stat st;
            if (stat(path.c_str(), &st) == 0 && S_ISREG(st.st_mode)) {
                if (name.size() > 4 && 
                    name.substr(name.size() - 4) == ".lua") {
                    ScriptEntry script;
                    script.name = name.substr(0, name.size() - 4);
                    script.path = path;
                    script.size = st.st_size;
                    scripts_.push_back(script);
                }
            }
        }
        
        closedir(d);
        
        // Sort by name
        std::sort(scripts_.begin(), scripts_.end(),
            [](const ScriptEntry& a, const ScriptEntry& b) {
                return a.name < b.name;
            });
        
        return true;
    }
    
    void List() const {
        if (scripts_.empty()) {
            printf("%s  (no scripts found in %s)%s\n", 
                   CLR_DIM, base_dir_.c_str(), CLR_RESET);
            return;
        }
        
        printf("%s  %-30s %-10s%s\n", CLR_DIM, "Name", "Size", CLR_RESET);
        printf("%s  %-30s %-10s%s\n", CLR_DIM, "---", "---", CLR_RESET);
        
        for (size_t i = 0; i < scripts_.size(); i++) {
            printf("  %s%zu.%s %s%-30s%s %s%zu bytes%s\n",
                   CLR_CYAN, i + 1, CLR_RESET,
                   CLR_WHITE, scripts_[i].name.c_str(), CLR_RESET,
                   CLR_DIM, scripts_[i].size, CLR_RESET);
        }
    }
    
    std::string GetContent(size_t index) const {
        if (index >= scripts_.size()) return "";
        
        std::ifstream file(scripts_[index].path);
        if (!file.is_open()) return "";
        
        std::stringstream ss;
        ss << file.rdbuf();
        return ss.str();
    }
    
    const ScriptEntry* Get(size_t index) const {
        if (index >= scripts_.size()) return nullptr;
        return &scripts_[index];
    }
    
    size_t Count() const { return scripts_.size(); }
    
    bool AddScript(const std::string& name, const std::string& content) {
        std::string path = base_dir_ + "/" + name + ".lua";
        std::ofstream file(path);
        if (!file.is_open()) return false;
        
        file << content;
        file.close();
        
        return LoadFromDir(base_dir_);
    }
    
private:
    std::vector<ScriptEntry> scripts_;
    std::string base_dir_;
};

// ══════════════════════════════════════════════════════════════
// IPC Client (same as payload side)
// ══════════════════════════════════════════════════════════════

class IPCClient {
public:
    IPCClient() : sock_(-1), connected_(false) {}
    
    bool Connect() {
        sock_ = socket(AF_UNIX, SOCK_STREAM, 0);
        if (sock_ < 0) return false;
        
        struct sockaddr_un addr = {};
        addr.sun_family = AF_UNIX;
        strncpy(addr.sun_path, EXECUTOR_SOCKET_PATH, sizeof(addr.sun_path) - 1);
        
        for (int i = 0; i < 20; i++) {
            if (connect(sock_, (struct sockaddr*)&addr, sizeof(addr)) == 0) {
                connected_ = true;
                return true;
            }
            usleep(100000);
        }
        
        close(sock_);
        sock_ = -1;
        return false;
    }
    
    bool SendScript(const std::string& script) {
        if (!connected_) return false;
        
        MessageHeader hdr = {};
        hdr.type = MsgType::EXECUTE_SCRIPT;
        hdr.payload_size = script.size();
        
        if (send(sock_, &hdr, sizeof(hdr), 0) != sizeof(hdr)) return false;
        if (send(sock_, script.c_str(), script.size(), 0) != (ssize_t)script.size()) return false;
        
        return true;
    }
    
    bool IsConnected() const { return connected_; }
    
private:
    int sock_;
    bool connected_;
};

// ══════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════

void PrintBanner() {
    printf("\n");
    printf(CLR_CYAN CLR_BOLD);
    printf("  ╔═══════════════════════════════════════════════════╗\n");
    printf("  ║                                                   ║\n");
    printf("  ║     ██████╗ ███████╗███╗   ██╗ ██████╗            ║\n");
    printf("  ║     ██╔══██╗██╔════╝████╗  ██║██╔════╝            ║\n");
    printf("  ║     ██████╔╝█████╗  ██╔██╗ ██║██║                 ║\n");
    printf("  ║     ██╔══██╗██╔══╝  ██║╚██╗██║██║                 ║\n");
    printf("  ║     ██║  ██║███████╗██║ ╚████║╚██████╗            ║\n");
    printf("  ║     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝ ╚═════╝            ║\n");
    printf("  ║                                                   ║\n");
    printf("  ║     EXECUTOR FRAMEWORK v1.0                       ║\n");
    printf("  ║     REA Mapped | Mac arm64                        ║\n");
    printf("  ║                                                   ║\n");
    printf("  ╚═══════════════════════════════════════════════════╝\n");
    printf(CLR_RESET "\n");
}

void PrintMenu() {
    printf(CLR_BOLD "\n  ─── MENU ────────────────────────────────────" CLR_RESET "\n");
    printf("  %s1.%s List scripts\n", CLR_CYAN, CLR_RESET);
    printf("  %s2.%s Execute script by number\n", CLR_CYAN, CLR_RESET);
    printf("  %s3.%s Execute script by name\n", CLR_CYAN, CLR_RESET);
    printf("  %s4.%s Execute custom Lua\n", CLR_CYAN, CLR_RESET);
    printf("  %s5.%s Create new script\n", CLR_CYAN, CLR_RESET);
    printf("  %s6.%s View script content\n", CLR_CYAN, CLR_RESET);
    printf("  %s7.%s Connect to injector\n", CLR_CYAN, CLR_RESET);
    printf("  %s8.%s Hotkeys reference\n", CLR_CYAN, CLR_RESET);
    printf("  %s9.%s Reload scripts\n", CLR_CYAN, CLR_RESET);
    printf("  %s0.%s Exit\n", CLR_CYAN, CLR_RESET);
    printf(CLR_BOLD "  ─────────────────────────────────────────────" CLR_RESET "\n");
}

void PrintHotkeys() {
    printf(CLR_YELLOW "\n  ─── HOTKEYS ─────────────────────────────────" CLR_RESET "\n");
    printf("  F1  = Toggle ESP\n");
    printf("  F2  = Toggle Ball ESP\n");
    printf("  F3  = Toggle Aimbot\n");
    printf("  F4  = Toggle Fly\n");
    printf("  F5  = Toggle Speed\n");
    printf("  F6  = Toggle Noclip\n");
    printf("  F7  = Toggle Infinite Jump\n");
    printf("  RightShift = Hide/Show UI\n");
    printf(CLR_YELLOW "  ─────────────────────────────────────────────" CLR_RESET "\n\n");
}

std::string GetInput(const std::string& prompt) {
    printf("%s", prompt.c_str());
    fflush(stdout);
    
    std::string line;
    std::getline(std::cin, line);
    return line;
}

int GetIntInput(const std::string& prompt, int min, int max) {
    std::string input = GetInput(prompt);
    try {
        int val = std::stoi(input);
        if (val >= min && val <= max) return val;
    } catch (...) {}
    
    printf("%s  Invalid input%s\n", CLR_RED, CLR_RESET);
    return -1;
}

int main(int argc, char* argv[]) {
    PrintBanner();
    
    // Initialize script library
    std::string script_dir = "./scripts";
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--scripts") == 0 && i + 1 < argc) {
            script_dir = argv[++i];
        }
    }
    
    ScriptLibrary library;
    if (!library.LoadFromDir(script_dir)) {
        printf("%s  Warning: Could not load scripts from %s%s\n",
               CLR_YELLOW, script_dir.c_str(), CLR_RESET);
        mkdir(script_dir.c_str(), 0755);
        library.LoadFromDir(script_dir);
    }
    
    printf("%s  Loaded %zu scripts from %s%s\n",
           CLR_GREEN, library.Count(), script_dir.c_str(), CLR_RESET);
    
    // IPC connection
    IPCClient ipc;
    bool connected = false;
    
    // Main loop
    bool running = true;
    while (running) {
        PrintMenu();
        
        std::string choice = GetInput(CLR_GREEN "  Select: " CLR_RESET);
        
        if (choice == "1") {
            printf(CLR_BOLD "\n  ─── SCRIPTS ────────────────────────────────" CLR_RESET "\n\n");
            library.List();
            
        } else if (choice == "2") {
            printf(CLR_BOLD "\n  ─── EXECUTE BY NUMBER ──────────────────────" CLR_RESET "\n\n");
            library.List();
            
            int idx = GetIntInput(CLR_GREEN "  Enter number (0 to cancel): " CLR_RESET, 0, library.Count());
            if (idx > 0) {
                std::string content = library.GetContent(idx - 1);
                if (!content.empty()) {
                    if (connected) {
                        ipc.SendScript(content);
                        printf("%s  [+] Script sent: %s%s\n",
                               CLR_GREEN, library.Get(idx-1)->name.c_str(), CLR_RESET);
                    } else {
                        printf("%s  [!] Not connected. Use option 7 to connect.%s\n",
                               CLR_YELLOW, CLR_RESET);
                        printf("%s  Script preview:%s\n\n", CLR_DIM, CLR_RESET);
                        printf("%s\n", content.substr(0, 500).c_str());
                    }
                }
            }
            
        } else if (choice == "3") {
            std::string name = GetInput(CLR_GREEN "  Script name: " CLR_RESET);
            bool found = false;
            for (size_t i = 0; i < library.Count(); i++) {
                if (library.Get(i)->name == name) {
                    std::string content = library.GetContent(i);
                    if (connected) {
                        ipc.SendScript(content);
                        printf("%s  [+] Script sent: %s%s\n", CLR_GREEN, name.c_str(), CLR_RESET);
                    } else {
                        printf("%s  [!] Not connected%s\n", CLR_YELLOW, CLR_RESET);
                    }
                    found = true;
                    break;
                }
            }
            if (!found) {
                printf("%s  [!] Script not found: %s%s\n", CLR_RED, name.c_str(), CLR_RESET);
            }
            
        } else if (choice == "4") {
            printf(CLR_BOLD "\n  ─── CUSTOM LUA ─────────────────────────────" CLR_RESET "\n");
            printf("%s  Enter Lua code (empty line to execute, 'cancel' to abort):%s\n\n", CLR_DIM, CLR_RESET);
            
            std::string script;
            std::string line;
            while (true) {
                printf("  > ");
                fflush(stdout);
                std::getline(std::cin, line);
                if (line == "cancel" || line == "quit") break;
                if (line.empty() && !script.empty()) break;
                if (!line.empty()) script += line + "\n";
            }
            
            if (!script.empty()) {
                if (connected) {
                    ipc.SendScript(script);
                    printf("%s  [+] Custom script sent%s\n", CLR_GREEN, CLR_RESET);
                } else {
                    printf("%s  [!] Not connected%s\n", CLR_YELLOW, CLR_RESET);
                    printf("%s  Script:%s\n%s\n", CLR_DIM, CLR_RESET, script.c_str());
                }
            }
            
        } else if (choice == "5") {
            std::string name = GetInput(CLR_GREEN "  Script name: " CLR_RESET);
            if (!name.empty()) {
                printf("%s  Enter content (empty line to save):%s\n\n", CLR_DIM, CLR_RESET);
                
                std::string content;
                std::string line;
                while (true) {
                    printf("  > ");
                    fflush(stdout);
                    std::getline(std::cin, line);
                    if (line.empty()) break;
                    content += line + "\n";
                }
                
                if (library.AddScript(name, content)) {
                    printf("%s  [+] Script saved: %s.lua%s\n",
                           CLR_GREEN, name.c_str(), CLR_RESET);
                } else {
                    printf("%s  [!] Failed to save script%s\n", CLR_RED, CLR_RESET);
                }
            }
            
        } else if (choice == "6") {
            library.List();
            int idx = GetIntInput(CLR_GREEN "  View which? (0 to cancel): " CLR_RESET, 0, library.Count());
            if (idx > 0) {
                std::string content = library.GetContent(idx - 1);
                if (!content.empty()) {
                    printf(CLR_BOLD "\n  ─── %s ──────────────────────" CLR_RESET "\n\n",
                           library.Get(idx-1)->name.c_str());
                    printf("%s\n", content.c_str());
                }
            }
            
        } else if (choice == "7") {
            printf("%s  Connecting to injector...%s\n", CLR_DIM, CLR_RESET);
            if (ipc.Connect()) {
                connected = true;
                printf("%s  [+] Connected to injector!%s\n", CLR_GREEN, CLR_RESET);
            } else {
                printf("%s  [!] Could not connect. Is injector running?%s\n",
                       CLR_RED, CLR_RESET);
                printf("%s  Start injector first: ./injector%s\n", CLR_DIM, CLR_RESET);
            }
            
        } else if (choice == "8") {
            PrintHotkeys();
            
        } else if (choice == "9") {
            if (library.LoadFromDir(script_dir)) {
                printf("%s  [+] Reloaded %zu scripts%s\n",
                       CLR_GREEN, library.Count(), CLR_RESET);
            } else {
                printf("%s  [!] Failed to reload scripts%s\n", CLR_RED, CLR_RESET);
            }
            
        } else if (choice == "0") {
            running = false;
            printf("%s  Goodbye!%s\n", CLR_CYAN, CLR_RESET);
            
        } else {
            printf("%s  Invalid option%s\n", CLR_RED, CLR_RESET);
        }
    }
    
    return 0;
}
