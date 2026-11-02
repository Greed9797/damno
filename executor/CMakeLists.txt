cmake_minimum_required(VERSION 3.20)
project(RobloxExecutor VERSION 1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

# Mac arm64 specific flags
if(APPLE)
    set(CMAKE_OSX_ARCHITECTURES "arm64")
    set(CMAKE_MACOSX_DEPLOYMENT_TARGET "12.0")
endif()

# Compiler flags
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -Wno-unused-parameter")
set(CMAKE_CXX_FLAGS_DEBUG "-g -O0")
set(CMAKE_CXX_FLAGS_RELEASE "-O2 -DNDEBUG")

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)

# ══════════════════════════════════════════════════════════════
# Injector executable
# ══════════════════════════════════════════════════════════════
add_executor(injector
    src/injector.cpp
)

# Link Mac-specific libraries
if(APPLE)
    target_link_libraries(injector
        "-framework CoreFoundation"
        "-framework MachO"
        proc
    )
endif()

# ══════════════════════════════════════════════════════════════
# Payload dynamic library
# ══════════════════════════════════════════════════════════════
add_library(payload SHARED
    dll/payload.cpp
)

set_target_properties(payload PROPERTIES
    PREFIX ""
    SUFFIX ".dylib"
    OUTPUT_NAME "payload"
    CXX_VISIBILITY_PRESET hidden
    VISIBILITY_INLINES_HIDDEN ON
)

# Link payload against system libs
if(APPLE)
    target_link_libraries(payload
        "-framework CoreFoundation"
        dl
        pthread
    )
endif()

# ══════════════════════════════════════════════════════════════
# Simple UI (terminal-based)
# ══════════════════════════════════════════════════════════════
add_executable(rea_exec
    ui/main.cpp
    src/injector.cpp
)

target_include_directories(rea_exec PRIVATE include)

if(APPLE)
    target_link_libraries(rea_exec
        "-framework CoreFoundation"
        "-framework MachO"
        proc
    )
endif()

# ══════════════════════════════════════════════════════════════
# Install
# ══════════════════════════════════════════════════════════════
install(TARGETS injector payload rea_exec
    RUNTIME DESTINATION bin
    LIBRARY DESTINATION lib
)

# Copy scripts directory
install(DIRECTORY scripts/
    DESTINATION share/rea-exec/scripts
    FILES_MATCHING PATTERN "*.lua"
)

message(STATUS "")
message(STATUS "=== REA Executor Build ===")
message(STATUS "Injector:   bin/injector")
message(STATUS "Payload:    lib/payload.dylib")
message(STATUS "UI:         bin/rea_exec")
message(STATUS "==========================")
message(STATUS "")
