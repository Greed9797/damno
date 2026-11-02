# REA Executor Framework

Roblox executor framework para Mac arm64. Arquitetura modular: injector + payload DLL + terminal UI.

## Estrutura

```
executor/
├── include/
│   └── common.h          # Protocolo IPC, structs, defs compartilhadas
├── src/
│   └── injector.cpp      # Encontra Roblox, injeta payload, server IPC
├── dll/
│   └── payload.cpp       # DLL que roda dentro do Roblox, executa Luau
├── ui/
│   └── main.cpp          # Terminal UI para gerenciar scripts
├── scripts/              # Coloca seus .lua aqui
└── CMakeLists.txt        # Build system
```

## Build

```bash
cd executor
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j4
```

Saída:
- `build/injector` — binary principal
- `build/payload.dylib` — DLL injetada
- `build/rea_exec` — UI terminal

## Uso

### 1. Terminal 1 — Injector
```bash
sudo ./build/injector --dll ./build/payload.dylib
```

### 2. Terminal 2 — UI
```bash
./build/rea_exec --scripts ./scripts
```

### 3. Copiar scripts
```bash
cp illegal_soccer_full.lua executor/scripts/
```

## Arquitetura

```
┌─────────────┐     Unix Socket      ┌──────────────┐
│  Injector   │◄────────────────────►│   Payload    │
│  (injector) │   /tmp/.roblox_exec  │  (payload)   │
└─────────────┘                      └──────┬───────┘
                                            │
                                     ┌──────▼───────┐
                                     │ Luau Bridge  │
                                     │ Roblox VM    │
                                     └──────────────┘
```

### Injector
- Enumera processos via `proc_listpids`
- Encontra `RobloxPlayer` por nome/path
- Injeta via 3 métodos:
  1. `DYLD_INSERT_LIBRARIES` (restart-based)
  2. Remote thread + `dlopen` (Mach APIs)
  3. Shellcode injection (fallback)
- IPC server no Unix socket

### Payload DLL
- Roda dentro do processo Roblox
- Conecta ao injector via socket
- Luau Bridge: encontra VM do Roblox e executa scripts
- Recebe scripts, retorna resultados

### IPC Protocolo
```
Injector → Payload:
  EXECUTE_SCRIPT  — string Lua
  SET_OPTION      — ExecutorOptions struct
  PING            — health check
  SHUTDOWN        — unload

Payload → Injector:
  READY           — payload inicializado
  SCRIPT_RESULT   — output do script
  SCRIPT_ERROR    — erro de execução
  LOG             — log messages
  PONG            — alive response
```

## Luau Bridge — Como funciona

O payload precisa encontrar a Luau VM do Roblox. Três métodos:

1. **Symbol lookup** — `dlsym` para achar `luaL_loadbuffer`, `lua_pcall`
2. **Signature scan** — procura bytes específicos da função no binário
3. **Hook** — intercepta o path de execução de scripts do Roblox

**IMPORTANTE:** Hyperion (anti-cheat do Roblox) protege a VM. Offsets mudam a cada update do Roblox. Você precisa:
- Extrair offsets da versão atual do RobloxPlayer
- Atualizar signatures no `payload.cpp`
- Testar em conta alt primeiro

## Offsets por versão

Para atualizar offsets, extraia do RobloxPlayer atual:

```bash
# Achar luaL_loadbuffer
strings -a /Applications/Roblox.app/Contents/MacOS/RobloxPlayer | grep luaL
nm -gU /Applications/Roblox.app/Contents/MacOS/RobloxPlayer | grep lua

# Usar Hopper/Ghidra pra achar endereços
# Copiar offsets pro payload.cpp
```

## Scripts de exemplo

Coloca `.lua` em `scripts/`. O UI lista e injeta eles.

Script mínimo:
```lua
print("Hello from executor!")
game:GetService("StarterGui"):SetCore("SendNotification", {
    Title = "REA",
    Text = "Script executed!",
    Duration = 3
})
```

## Limitações conhecidas

1. **Hyperion** — anti-cheat do Roblox bloqueia injeção direta. Precisa de bypass específico por versão.
2. **Offsets** — Luau VM muda a cada update do Roblox.
3. **Mac injection** — `task_for_pid` precisa de entitlements ou SIP disabled.
4. **Jailbreak** — sem isso, Mac injection é limitado.

## Fluxo completo

```
1. Build: cmake + make
2. Start Roblox, abre o jogo
3. Run injector (sudo se necessário)
4. Injector injeta payload.dylib no Roblox
5. Payload conecta via socket
6. Run UI, lista scripts, injeta
7. Script roda dentro do Roblox
```

## Desenvolvimento

### Adicionar features
- Editar `dll/payload.cpp` pra novas APIs
- Editar `src/injector.cpp` pra novos métodos de injeção
- Editar `ui/main.cpp` pra novas opções

### Debug
```bash
# Ver logs do payload
tail -f /tmp/roblox_exec.log

# Testar sem Roblox
./build/injector --no-inject
```

## Segurança

- Use conta alt pra testar
- Hyperion pode banir
- Não roda em conta principal com valuables
- Open source — audita o código antes de usar
