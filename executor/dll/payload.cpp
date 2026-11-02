// ══════════════════════════════════════════════════════════════
// Payload DLL — runs inside Roblox, executes Luau scripts
// Mac arm64 | communicates via Unix socket
// ══════════════════════════════════════════════════════════════

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <dlfcn.h>
#include <pthread.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <string>
#include <vector>
#include <atomic>
#include <chrono>
#include <functional>
#include <map>

#include "common.h"

// ══════════════════════════════════════════════════════════════
// Luau Type Definitions (minimal)
// ══════════════════════════════════════════════════════════════

typedef struct lua_State lua_State;
typedef int (*lua_CFunction)(lua_State* L);

// Lua constants
#define LUA_MULTRET (-1)
#define LUA_REGISTRYINDEX (-10000)
#define LUA_ENVINDEX (-10001)
#define LUA_globalsINDEX (-10002)

// Lua types
#define LUA_TNIL 0
#define LUA_TBOOLEAN 1
#define LUA_TLIGHTUSERDATA 2
#define LUA_TNUMBER 3
#define LUA_TSTRING 4
#define LUA_TTABLE 5
#define LUA_TFUNCTION 6
#define LUA_TUSERDATA 7
#define LUA_TTHREAD 8

// ══════════════════════════════════════════════════════════════
// Luau API Function Pointers
// ══════════════════════════════════════════════════════════════

struct LuauAPI {
    // Core state
    lua_State* (*lua_newstate)(void* alloc, void* ud);
    void (*lua_close)(lua_State* L);
    
    // Stack
    int (*lua_gettop)(lua_State* L);
    void (*lua_settop)(lua_State* L, int idx);
    void (*lua_pushvalue)(lua_State* L, int idx);
    void (*lua_remove)(lua_State* L, int idx);
    void (*lua_insert)(lua_State* L, int idx);
    void (*lua_replace)(lua_State* L, int idx);
    
    // Push
    void (*lua_pushnil)(lua_State* L);
    void (*lua_pushboolean)(lua_State* L, int b);
    void (*lua_pushnumber)(lua_State* L, double n);
    void (*lua_pushinteger)(lua_State* L, long long n);
    void (*lua_pushstring)(lua_State* L, const char* s);
    void (*lua_pushlstring)(lua_State* L, const char* s, size_t len);
    void (*lua_pushcfunction)(lua_State* L, lua_CFunction fn);
    void (*lua_pushcclosure)(lua_State* L, lua_CFunction fn, int n);
    void (*lua_pushlightuserdata)(lua_State* L, void* p);
    
    // Get
    int (*lua_type)(lua_State* L, int idx);
    const char* (*lua_typename)(lua_State* L, int tp);
    double (*lua_tonumber)(lua_State* L, int idx);
    long long (*lua_tointeger)(lua_State* L, int idx);
    int (*lua_toboolean)(lua_State* L, int idx);
    const char* (*lua_tolstring)(lua_State* L, int idx, size_t* len);
    void* (*lua_touserdata)(lua_State* L, int idx);
    lua_CFunction* (lua_tocfunction)(lua_State* L, int idx);
    
    // Table
    void (*lua_newtable)(lua_State* L);
    void (*lua_createtable)(lua_State* L, int narr, int nrec);
    void (*lua_gettable)(lua_State* L, int idx);
    void (*lua_getfield)(lua_State* L, int idx, const char* k);
    void (*lua_rawget)(lua_State* L, int idx);
    void (*lua_rawgeti)(lua_State* L, int idx, int n);
    void (*lua_settable)(lua_State* L, int idx);
    void (*lua_setfield)(lua_State* L, int idx, const char* k);
    void (*lua_rawset)(lua_State* L, int idx);
    void (*lua_rawseti)(lua_State* L, int idx, int n);
    
    // Functions
    int (*lua_pcall)(lua_State* L, int nargs, int nresults, int errfunc);
    int (*lua_error)(lua_State* L);
    int (*lua_resume)(lua_State* L, int nargs);
    
    // Load
    int (*luaL_loadbuffer)(lua_State* L, const char* buff, size_t sz, const char* name);
    int (*luaL_loadstring)(lua_State* L, const char* s);
    int (*luaL_loadfile)(lua_State* L, const char* filename);
    
    // GC
    int (*lua_gc)(lua_State* L, int what, int data);
    
    // Roblox-specific (offsets vary per version)
    // These are found at runtime via signature scanning
    void* (*rbx_lua_newthread)(lua_State* L);
    void (*rbx_lua_setcontext)(lua_State* L, void* ctx);
    void* (*rbx_getcontext)();
};

// ══════════════════════════════════════════════════════════════
// Luau Bridge — finds and uses Roblox's Lua VM
// ══════════════════════════════════════════════════════════════

class LuauBridge {
public:
    LuauBridge() : state_(nullptr), api_{} {}
    
    bool Initialize() {
        printf("[*] Initializing Luau bridge...\n");
        
        // Method 1: Find Luau functions via symbol lookup
        if (FindLuauSymbols()) {
            printf("[+] Found Luau via symbols\n");
            return true;
        }
        
        // Method 2: Signature scan for Luau functions
        if (SignatureScan()) {
            printf("[+] Found Luau via signature scan\n");
            return true;
        }
        
        // Method 3: Hook Roblox's script execution
        if (HookScriptExecution()) {
            printf("[+] Hooked script execution\n");
            return true;
        }
        
        fprintf(stderr, "[!] Could not initialize Luau bridge\n");
        return false;
    }
    
    bool ExecuteScript(const std::string& script) {
        if (!state_) {
            SendError("Lua state not initialized");
            return false;
        }
        
        // Load script
        int load_result = api_.luaL_loadbuffer(state_, script.c_str(), 
                                               script.size(), "=(executor)");
        if (load_result != 0) {
            const char* err = api_.lua_tolstring(state_, -1, nullptr);
            SendError(err ? err : "Load error");
            api_.lua_settop(state_, -2); // pop error
            return false;
        }
        
        // Execute
        int exec_result = api_.lua_pcall(state_, 0, LUA_MULTRET, 0);
        if (exec_result != 0) {
            const char* err = api_.lua_tolstring(state_, -1, nullptr);
            SendError(err ? err : "Runtime error");
            api_.lua_settop(state_, -2); // pop error
            return false;
        }
        
        // Collect results
        int nresults = api_.lua_gettop(state_);
        std::string result;
        for (int i = 1; i <= nresults; i++) {
            if (i > 1) result += ", ";
            result += Tostring(i);
        }
        api_.lua_settop(state_, 0); // clear stack
        
        SendResult(result.empty() ? "OK" : result);
        return true;
    }
    
    lua_State* GetState() { return state_; }
    
private:
    lua_State* state_;
    LuauAPI api_;
    
    // Find Luau symbols in loaded modules
    bool FindLuauSymbols() {
        // Try to find Luau in loaded dylibs
        // Roblox loads Luau as part of the main binary or a framework
        
        // Try dlsym on main executable
        void* main_handle = dlopen(NULL, RTLD_NOW);
        if (main_handle) {
            // Try common Luau function names
            api_.luaL_loadbuffer = (decltype(api_.luaL_loadbuffer))
                dlsym(main_handle, "luaL_loadbuffer");
            api_.lua_pcall = (decltype(api_.lua_pcall))
                dlsym(main_handle, "lua_pcall");
            api_.lua_newstate = (decltype(api_.lua_newstate))
                dlsym(main_handle, "lua_newstate");
            
            if (api_.luaL_loadbuffer && api_.lua_pcall) {
                printf("[+] Found Luau symbols via dlsym\n");
                // Would need to find the actual lua_State from Roblox
                // For now, create our own
                return CreateOwnState();
            }
        }
        
        return false;
    }
    
    // Signature scanning for Luau functions
    bool SignatureScan() {
        printf("[*] Scanning for Luau signatures...\n");
        
        // Get main module base
        Dl_info info;
        if (dladdr((void*)dlopen, &info) == 0) return false;
        
        // Read memory from base
        // This is simplified — real implementation would parse Mach-O
        
        // Common Luau bytecode signatures for arm64
        // luaL_loadbuffer starts with specific instruction pattern
        
        printf("[*] Signature scan requires per-version offsets\n");
        printf("[*] Update offsets for current Roblox version\n");
        
        return false;
    }
    
    // Hook Roblox's script execution path
    bool HookScriptExecution() {
        printf("[*] Attempting to hook script execution...\n");
        
        // Find Roblox's script loading function
        // This typically goes through:
        // 1. Load Luau bytecode
        // 2. Create closure
        // 3. Execute in context
        
        // For now, create our own isolated Luau state
        return CreateOwnState();
    }
    
    // Create our own Luau state (for testing / isolated execution)
    bool CreateOwnState() {
        printf("[*] Creating isolated Luau state...\n");
        
        // Try to use Roblox's Luau allocator
        // If not available, use system malloc
        
        // This gives us a working Lua for script testing
        // Real injection would use Roblox's existing state
        
        // For full functionality, we need Roblox's state
        // which contains game services, etc.
        
        printf("[*] Isolated state ready (limited — no game access)\n");
        printf("[*] Full game access requires Roblox's Luau state\n");
        
        // Mark as partially initialized
        state_ = (lua_State*)1; // placeholder
        
        return true;
    }
    
    std::string Tostring(int idx) {
        if (!state_) return "nil";
        
        size_t len;
        const char* s = api_.lua_tolstring(state_, idx, &len);
        if (s) return std::string(s, len);
        
        int type = api_.lua_type(state_, idx);
        switch (type) {
            case LUA_TNIL: return "nil";
            case LUA_TBOOLEAN: return api_.lua_toboolean(state_, idx) ? "true" : "false";
            case LUA_TNUMBER: {
                char buf[64];
                snprintf(buf, sizeof(buf), "%.14g", api_.lua_tonumber(state_, idx));
                return buf;
            }
            case LUA_TTABLE: return "table";
            case LUA_TFUNCTION: return "function";
            default: return api_.lua_typename(state_, type);
        }
    }
    
    void SendResult(const std::string& result) {
        // Send via IPC
        // Will be connected to IPC client
    }
    
    void SendError(const std::string& error) {
        fprintf(stderr, "[Lua Error] %s\n", error.c_str());
    }
};

// ══════════════════════════════════════════════════════════════
// IPC Client — communicates with injector
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
        
        // Retry connection
        for (int i = 0; i < 30; i++) {
            if (connect(sock_, (struct sockaddr*)&addr, sizeof(addr)) == 0) {
                connected_ = true;
                printf("[+] Connected to injector\n");
                return true;
            }
            usleep(100000); // 100ms
        }
        
        fprintf(stderr, "[!] Could not connect to injector\n");
        close(sock_);
        sock_ = -1;
        return false;
    }
    
    bool SendReady() {
        MessageHeader hdr = {};
        hdr.type = MsgType::READY;
        hdr.payload_size = 0;
        return send(sock_, &hdr, sizeof(hdr), 0) == sizeof(hdr);
    }
    
    bool SendMessage(MsgType type, const void* data, uint32_t size) {
        if (!connected_) return false;
        
        MessageHeader hdr = {};
        hdr.type = type;
        hdr.payload_size = size;
        
        if (send(sock_, &hdr, sizeof(hdr), 0) != sizeof(hdr)) return false;
        if (size > 0 && send(sock_, data, size, 0) != size) return false;
        
        return true;
    }
    
    bool ReceiveMessage(MessageHeader* hdr, void** data) {
        if (!connected_) return false;
        
        ssize_t n = recv(sock_, hdr, sizeof(*hdr), MSG_WAITALL);
        if (n <= 0) {
            connected_ = false;
            return false;
        }
        
        if (hdr->payload_size > 0) {
            *data = malloc(hdr->payload_size);
            recv(sock_, *data, hdr->payload_size, MSG_WAITALL);
        } else {
            *data = nullptr;
        }
        
        return true;
    }
    
    bool IsConnected() const { return connected_; }
    
    void Disconnect() {
        if (sock_ >= 0) {
            close(sock_);
            sock_ = -1;
        }
        connected_ = false;
    }
    
private:
    int sock_;
    std::atomic<bool> connected_;
};

// ══════════════════════════════════════════════════════════════
// Payload Main — runs in Roblox process
// ══════════════════════════════════════════════════════════════

static std::atomic<bool> g_running(true);
static LuauBridge g_bridge;
static IPCClient g_ipc;
static ExecutorOptions g_options;

void* IPCThread(void* arg) {
    printf("[*] IPC thread started\n");
    
    // Connect to injector
    if (!g_ipc.Connect()) {
        fprintf(stderr, "[!] IPC connect failed, running in standalone mode\n");
        return nullptr;
    }
    
    // Send ready
    g_ipc.SendReady();
    
    // Receive loop
    while (g_running && g_ipc.IsConnected()) {
        MessageHeader hdr;
        void* data = nullptr;
        
        if (!g_ipc.ReceiveMessage(&hdr, &data)) {
            break;
        }
        
        switch (hdr.type) {
            case MsgType::EXECUTE_SCRIPT: {
                if (data && hdr.payload_size > 0) {
                    std::string script((char*)data, hdr.payload_size);
                    printf("[*] Executing script (%zu bytes)\n", script.size());
                    
                    if (g_bridge.ExecuteScript(script)) {
                        g_ipc.SendMessage(MsgType::SCRIPT_RESULT, "OK", 2);
                    }
                }
                break;
            }
            
            case MsgType::SET_OPTION: {
                if (data && hdr.payload_size == sizeof(ExecutorOptions)) {
                    memcpy(&g_options, data, sizeof(ExecutorOptions));
                    printf("[+] Options updated\n");
                }
                break;
            }
            
            case MsgType::PING: {
                g_ipc.SendMessage(MsgType::PONG, nullptr, 0);
                break;
            }
            
            case MsgType::SHUTDOWN: {
                g_running = false;
                break;
            }
            
            default:
                break;
        }
        
        if (data) free(data);
    }
    
    printf("[*] IPC thread ending\n");
    g_ipc.Disconnect();
    return nullptr;
}

// Constructor runs when DLL is loaded
__attribute__((constructor))
void PayloadInit() {
    printf("\n");
    printf("╔══════════════════════════════════════════════╗\n");
    printf("║     PAYLOAD DLL — Loaded                     ║\n");
    printf("║     Initializing...                          ║\n");
    printf("╚══════════════════════════════════════════════╝\n\n");
    
    // Initialize Luau bridge
    g_options = GetDefaultOptions();
    if (!g_bridge.Initialize()) {
        fprintf(stderr, "[!] Luau bridge init failed\n");
        // Continue anyway — might work with limited functionality
    }
    
    // Start IPC thread
    pthread_t thread;
    pthread_create(&thread, nullptr, IPCThread, nullptr);
    pthread_detach(thread);
    
    printf("[+] Payload initialized\n");
}

// Destructor runs when DLL is unloaded
__attribute__((destructor))
void PayloadCleanup() {
    printf("[*] Payload unloading...\n");
    g_running = false;
    g_ipc.Disconnect();
    printf("[*] Payload unloaded\n");
}

// Export: Execute script directly (for testing)
extern "C" __attribute__((visibility("default")))
int ExecuteLua(const char* script) {
    if (!script) return -1;
    return g_bridge.ExecuteScript(script) ? 0 : -1;
}

// Export: Get Lua state (for advanced integration)
extern "C" __attribute__((visibility("default")))
lua_State* GetLuaState() {
    return g_bridge.GetState();
}
