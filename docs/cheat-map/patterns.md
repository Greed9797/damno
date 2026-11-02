# Patterns — padrões extraídos

Só o que foi visto nos clones. Cada padrão: onde vi (repo + `arquivo:linha`), o que resolve, como aplicar, ligação com skill do pack.

## 1. Wrapper RPM/WPM template
- **Onde vi:** Device9999 `gta_external/memory/memory.hpp:27,34` (`read_mem<T>`/`write_mem<T>` sobre `ReadProcessMemory`/`WriteProcessMemory`) · huguluhu `src/core/memory.h:67-80` (`ReadRaw` com checagem `read == size`, `Read<T>`/`Write<T>`).
- **Resolve:** um ponto único de acesso a memória; handle/pid/base globais; detach/reattach encapsulado.
- **Como aplicar:** namespace `mem` com `g_handle/g_pid/g_base`, `Attach/Detach/Alive`, `ReadRaw` que retorna falso quando bytes lidos ≠ pedidos (fail closed — huguluhu `memory.h:67-71`). Leituras parciais nunca viram dado stale.
- **Skill:** → `memory-scanning`, → `attach-offsets`.

## 2. World-to-screen por viewmatrix
- **Onde vi:** Device9999 `gta_external/esp/esp.cpp:5-33` (lê viewport, viewmatrix em `viewport+0x24C`, transpose, projeção, Y invertido) · huguluhu `src/game/sdk.cpp:76-86` (matriz 16 floats, `cw < 0.001` descarta atrás da câmera).
- **Resolve:** conversão mundo→tela para ESP/aimbot.
- **Como aplicar:** w2s puro: valida `w` (depth) antes de dividir; retorna bool, não valor zeroambíguo. Device9999 usa `(0,0)` como sentinela (frágil); huguluhu usa `bool` + out-param (preferir).
- **Skill:** → `esp`, → `aimbot`.

## 3. ESP loop: lista de entidades → projeção → desenho
- **Onde vi:** Device9999 `esp/esp.cpp:349` `draw_esp` + replay interface `sdk/sdk.cpp:15-31` (PedList → array de peds) · huguluhu `src/features/esp.cpp:51-70` (`Draw()` filtra por `valid/distância/local`, desenha snapline/box/skeleton em `ImGui::GetBackgroundDrawList()`).
- **Resolve:** pipeline completo do ESP.
- **Como aplicar:** 1) atualizar snapshot de entidades (~8 ms, huguluhu `main.cpp:168-173`), 2) por entidade: filtro → w2s → box/skeleton/snapline, 3) desenhar só no frame do overlay. Skeleton = tabela fixa de pares bone-bone (`esp.cpp:8-17` huguluhu; `esp.cpp:91-93` Device9999).
- **Skill:** → `esp`.

## 4. Box por bones (fallback p/ pé)
- **Onde vi:** huguluhu `src/features/esp.cpp:19-47` `BuildBox` — projeta head/foot L/foot R; sem bones, deriva box do pé com altura fixa 90 px; `w = h * 0.42`.
- **Resolve:** box estável sem ler mins/maxs da entidade.
- **Como aplicar:** 3 pontos projetados → centro-x médio, altura foot-head, largura = 0.42×altura. Fallback quando falha `GetBonePos`.
- **Skill:** → `esp`.

## 5. Aimbot: seleção por métrica + smoothing com resíduo
- **Onde vi:** huguluhu `src/features/aimbot.cpp:54-97` (loop por jogador, FOV em px escalado por resolução, prioridade distância/health/distância-tela, switch delay `:96`) e `:132-155` (smooth divide delta, `Clampf` por `maxStep`, acumulador `s_remX/s_remY` guarda fração sub-pixel, movimento via `SendInput` ou `SetCursorPos`) · khannedj/asshetys9 `Aimbot.hpp:361-365` (suavização clássica `floor(target/smooth)/6.66`) e `Aimbot.hpp:124` `aimbot_silent` · Device9999 `aimbot/aimbot.cpp:4-27` (FOV fixo 25 px, `mouse_event`).
- **Resolve:** mira suave sem tremor (resíduo elimina jitter de arredondamento).
- **Como aplicar:** métrica de alvo = dist-tela por default; suavidade = `delta/smooth` com clamp por passo máximo; guardar resíduo fracionário entre frames. Guard: só roda com janela do jogo em foreground (`aimbot.cpp:59`).
- **Skill:** → `aimbot`, → `cheat-humanization` (o resíduo+clamp é anti-snap natural; nenhum repo tem smoothing de ângulo por quaternion — gap).

## 6. Triggerbot com delay acumulado
- **Onde vi:** huguluhu `src/features/aimbot.cpp:117-130` — se alvo dentro de `triggerRadius` (escalado por altura de tela), `trigTimer += dt` até `triggerDelay`, então `SendInput` click; sai do raio zera o timer.
- **Resolve:** dispara só quando mira assentada, com atraso configurável.
- **Como aplicar:** timer por frame com dt (não `Sleep`); reset ao sair do raio. Radius em px relativos a 1080p.
- **Skill:** → `cheat-triggerbot-rcs`.

## 7. Overlay topmost click-through (HWND próprio + D3D swapchain)
- **Onde vi:** huguluhu `src/ui/overlay.cpp:66-67` (`WS_EX_TOPMOST|WS_EX_TRANSPARENT|WS_EX_LAYERED|WS_EX_TOOLWINDOW` + `WS_POPUP`) · Device9999 `overlay/overlay.cpp:136-148` (posiciona sobre a janela do jogo, `DwmExtendFrameIntoClientArea` com margins -1, `SetWindowLong` `WS_EX_LAYERED|WS_EX_TRANSPARENT`) · XirLoader `main.py:29591-29600` (`SetWindowDisplayAffinity(hwnd, 0x11)` recursivo em filhos).
- **Resolve:** desenho por cima do jogo sem interceptar input (transparent) e sem aparecer em captura de tela (WDA_EXCLUDEFROMCAPTURE).
- **Como aplicar:** janela popup sized na janela do jogo + DWM margins -1 + exstyle layered/transparent/topmost; `FollowGameWindow` no loop (huguluhu `overlay.h:11`); streamproof = `WDA_EXCLUDEFROMCAPTURE` (0x11) em todos os HWNDs da árvore.
- **Skill:** → `overlay-render`.

## 8. Hook de Present + ImGui (internal)
- **Onde vi:** khannedj/asshetys9 `Core.cpp:117` `PresentHook`, `Core.cpp:79` `BindD3DInfo` (cria device/RTV na primeira chamada), `d3d_Hook.cpp:123-133` (`MH_CreateHook`/`MHEnableHook` no vtable de `IDXGISwapChain`), `Core.cpp:313` registro.
- **Resolve:** menu/desenho dentro do processo do jogo.
- **Como aplicar:** MinHook no `Present[8]`, lazy-init do ImGui DX11 na primeira apresentação, `WndProc` encadeado. Alternativa external: padrão 7 (não há injeção).
- **Skill:** → `overlay-render` (rota externa), `cheat-framework` (rota interna).

## 9. Pattern scan como auto-offset
- **Onde vi:** asshetys9/khannedj `dllmain.cpp:57-61` — `Memory::PatternScan(E("48 8B 05 ? ? ? ? ..."))` para `World`, `ReplayInterface`, `W2S`, `BonePos`, `Camera`, com RIP-relative resolve (7/NULL) · Device9999 `esp/esp.cpp:6` (offset fixo com branch steam/non-steam) · huguluhu `src/core/offsets.h` (offsets fixos comentados + tab Debug pra retune sem recompilar).
- **Resolve:** sobreviver a update do jogo sem recompilar (pattern) ou retune rápido (offsets externos).
- **Como aplicar:** para external, offsets num bloco `namespace off` + mecanismo de retune em runtime (huguluhu); para internal, signature scan com wildcard + RIP resolve. Três estratégias observadas, nenhuma mistura pattern+fixo no mesmo repo.
- **Skill:** → `offset-toolchain`, → `attach-offsets`, → `memory-scanning`.

## 10. IOCTL R/W de kernel (canal usermode↔driver)
- **Onde vi:** nkga `src/driver_codes.h:8,11-17` (`CTL_CODE` METHOD_BUFFERED + struct `DRIVER_COPY_MEMORY`) e `src/driver.c:27-56,69-95` (`PsLookupProcessByProcessId` → `MmCopyVirtualMemory` → `IoCompleteRequest`, com validação de tamanho do buffer).
- **Resolve:** R/W fora do alcance de handle de usermode (EAC/BE bloqueiam RPM no processo do jogo — `README.MD`).
- **Como aplicar:** um IOCTL, um struct {src,dst,size,pid,write}, `METHOD_BUFFERED`, checagem `inputLength >= sizeof` antes de usar o buffer. Client = `CreateFileW` + `DeviceIoControl` (README do repo).
- **Skill:** → `cheat-framework` (rota kernel), `attach-offsets` (transport).

## 11. Higiene de driver carregado (PiDDB/HashBucket/MMU)
- **Onde vi:** DErDYAST1R `PiDDB/piddb.cpp:180,217` (`LocatePiDDB` + `clearCache` por timeDateStamp), `HashBucket/hash.cpp:11`, `MMU_MML/mmu_mml.cpp:67`, orquestração `entry/main.cpp:38-58`.
- **Resolve:** apagar rastros estruturais do driver nos caches do kernel após load.
- **Como aplicar:** sequência fixa clearCache → clearHashBucket → CleanMmu; exige resolver `PiDDBLock`/tabela por pattern scan (`BBScanSection`). Limite documentado: `PsLoadedModuleList` precisa de PG bypass.
- **Skill:** → `cheat-framework`, → `cheat-detection-surface`.

## 12. Manual map de driver sem lista de módulos
- **Onde vi:** Hyperspace `bootstrapper/src/map/map.hxx:10-30` (`create`: `MmAllocateIndependentPages` → memset → `MmSetPageProtection` → `relocate`), exports do ntoskrnl via PDB (`map.hxx:126,153`), strings `oxorany`.
- **Resolve:** carregar driver sem DSE/`PsLoadedModuleList`, fora de pool scan.
- **Como aplicar:** alocação independente + reloc + resolução dinâmica de exports (nada hardcoded por RVA). Caso de estudo; combina com padrão 11 (limpar caches) e com page hiding do próprio repo (`payload/src/paging/`).
- **Skill:** → `cheat-framework`.

## 13. Payload criptografado em memória (encrypt-at-rest / decrypt-on-use)
- **Onde vi:** XirLoader `main.py:26035,26062` (`_memory_encrypt`/`_memory_decrypt` com `VirtualProtect` PAGE_EXECUTE_READWRITE na volta), `:26097-26104` (região cifrada em repouso, decripta só na execução, re-cifra), `_protected_regions` com chave por região (`:25346`).
- **Resolve:** código em repouso ilegível para scan de memória.
- **Como aplicar:** por região: gerar chave → cifrar → gravar; ao executar: decriptar → correr → re-cifrar. Padrão observado só em Python/loader; nenhum repo C++ da lista faz isso (gap).
- **Skill:** → `cheat-framework`, → `cheat-detection-surface`.

## 14. Anti-debug + lista de APIs sensíveis
- **Onde vi:** XirLoader `main.py:25695,26657-26663` (`IsDebuggerPresent`, `CheckRemoteDebuggerPresent`), `:25228-25230` (watchlist `ReadProcessMemory`, `VirtualAllocEx`, `CreateRemoteThread`, `NtCreateSection`...), `:27042` `_anti_debug_protection`.
- **Resolve:** detectar análise antes de executar payload.
- **Como aplicar:** checagem dupla (local + remote) + deny-list de APIs de injeção monitoradas por anti-cheat/EDR.
- **Skill:** → `cheat-detection-surface`.

## 15. Loop principal com reattach e dt clampado
- **Onde vi:** huguluhu `src/main.cpp:143-199` — dt clamp `> 0.25s → 0.25`, rescan de janela/ processo a cada 2 s, `sdk::Update()` a cada ≥8 ms, ordem fixa: messages → input → update → features → draw → `Sleep(1)`, teardown ordenado no fim (`config::Save`, `lua::Shutdown`, `overlay::Destroy`, `mem::Detach`).
- **Resolve:** estabilidade quando o jogo morre/reinicia; sem frame skip silencioso.
- **Como aplicar:** um loop, um relógio; reattach automático; shutdown em ordem inversa de criação.
- **Skill:** → `cheat-framework`.

## 16. Engine Lua sobre a camada de memória
- **Onde vi:** huguluhu `src/scripting/lua_engine.cpp:30-49` (bindings `read8/16/32/64/f/d`, `write*`, `world_to_screen`, `players`), `:144-146` (`luaL_newstate` + `luaL_openlibs`), log ring-buffer de 500 linhas (`:19-24`).
- **Resolve:** scripts de usuário sem recompilar o cheat.
- **Como aplicar:** lua_State único; expor só as primitivas já validadas do padrão 1 (leitura/w2s/players); nunca expor ponteiros crus sem checagem. Asshetys9 claima executor/dumper mas não tem código — não usar como referência.
- **Skill:** → `lua-ui`, → `executor`.
