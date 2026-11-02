#pragma once
// ══════════════════════════════════════════════════════════════
// Executor Common — shared between injector and payload
// ══════════════════════════════════════════════════════════════

#include <string>
#include <vector>
#include <cstdint>
#include <cstring>

// IPC socket path (Unix domain socket for Mac)
#define EXECUTOR_SOCKET_PATH "/tmp/.roblox_exec.sock"

// Named pipe for Windows compatibility
#define EXECUTOR_PIPE_NAME "\\\\.\\pipe\\roblox_exec_pipe"

// Message types
enum class MsgType : uint32_t {
    // Injector -> Payload
    EXECUTE_SCRIPT   = 0x0001,
    EXECUTE_FILE     = 0x0002,
    GET_STATE        = 0x0003,
    SET_OPTION       = 0x0004,
    PING             = 0x0005,
    SHUTDOWN         = 0x0006,
    
    // Payload -> Injector
    SCRIPT_RESULT    = 0x1001,
    SCRIPT_ERROR     = 0x1002,
    STATE_RESPONSE   = 0x1003,
    PONG             = 0x1004,
    LOG              = 0x1005,
    READY            = 0x1006,
};

// Message header
#pragma pack(push, 1)
struct MessageHeader {
    MsgType type;
    uint32_t payload_size;
    uint32_t sequence;
};

struct ScriptMessage {
    MessageHeader header;
    char script_data[1]; // flexible array
};

struct ErrorMessage {
    MessageHeader header;
    int32_t error_code;
    char error_msg[1];
};
#pragma pack(pop)

// Executor options
struct ExecutorOptions {
    bool anti_afk;
    bool anti_screenshot;
    bool no_clip_default;
    bool auto_attach;
    bool log_execution;
    int  max_script_size; // MB
    char script_dir[256];
};

// Default options
inline ExecutorOptions GetDefaultOptions() {
    ExecutorOptions opts = {};
    opts.anti_afk = true;
    opts.anti_screenshot = false;
    opts.no_clip_default = false;
    opts.auto_attach = true;
    opts.log_execution = true;
    opts.max_script_size = 10;
    strncpy(opts.script_dir, "./scripts", sizeof(opts.script_dir) - 1);
    return opts;
}

// Error codes
enum ExecError {
    ERR_NONE           = 0,
    ERR_SCRIPT_TOO_BIG = 1,
    ERR_LUA_ERROR      = 2,
    ERR_NOT_READY      = 3,
    ERR_VM_NOT_FOUND   = 4,
    ERR_INJECT_FAILED  = 5,
    ERR_PROCESS_NOT_FOUND = 6,
    ERR_PERMISSION     = 7,
};

// Utility: find Roblox process PID (Mac)
// Returns 0 if not found
uint32_t FindRobloxPID();

// Utility: read file contents
std::string ReadFile(const std::string& path);

// Utility: write file
bool WriteFile(const std::string& path, const std::string& content);
