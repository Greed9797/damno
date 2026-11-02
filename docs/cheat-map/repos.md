# Repos — ficha por repositório

## castellri/FiveM-External-Cheat
- ★ 1 · license Apache-2.0 (LICENSE file) · C++ · default branch `main` · pushed 2026-10-31
- Features no código: **nenhuma implementada no repo** — o `FiveM.vcxproj` referencia `Core.cpp`, `d3d_Hook.cpp`, `dllmain.cpp`, `Menu.cpp`, `program.cpp`, `imgui_animated.cpp`, mas nenhum desses arquivos existe no clone. O que está presente: vendor `imgui/` (DX11+Win32 backends), vendor `minhook/`, `Loader.exe` pré-compilado, `lib/proxine.lib`, assets PNG.
- Arquivos-chave: `FiveM.vcxproj` (lista de fontes esperadas), `imgui/`, `minhook/`, `README.md` (claim: aimbot, triggerbot, exploits — não verificável, sem fonte).
- Aproveitável: estrutura de projeto VS + stack declarada (ImGui DX11 + MinHook + loader externo). Byte-idêntico ao harrenscore (diff -rq vazio). Sem fontes = referência de layout apenas.

## harrenscore/FiveM-External-Cheat
- ★ 1 · license Apache-2.0 · C++ · `main` · pushed 2026-10-20
- Cópia exata do castellri (`diff -rq --exclude=.git` vazio entre os dois clones). Mesmas features ausentes, mesmo vendor, mesmo `Loader.exe`.
- Arquivos-chave: idênticos aos de castellri.
- Aproveitável: prova de que o template circula clonado; não duplica nada além do que castellri já cobre.

## khannedj/FiveM-Mod-Menu
- ★ 1 · license Apache-2.0 · C++ · `main` · pushed 2026-10-23
- Features confirmadas no código: menu ImGui em DX11 (`Core.cpp:117` `PresentHook`, `Core.cpp:79` `BindD3DInfo`), ESP/skeleton e aimbot (`Aimbot.hpp:124` `aimbot_silent`, `Aimbot.hpp:285` `do_aimbot` com suavização `Aimbot.hpp:361-365`), wrappers de structs GTA `hk_Ped`/`hk_ReplayInterface`/`hk_World` (`Classes.hpp:616-800`), pattern scan de offsets (`dllmain.cpp:57-61` via `Memory::PatternScan(E("48 8B 05 ..."))`). README claima Lua executor, dumper, spoofer, no recoil — **sem código Lua/dumper/spoofer no repo** (só código de scripthook deixado comentado em `dllmain.cpp`).
- Arquivos-chave: `dllmain.cpp`, `Core.cpp`, `Aimbot.hpp`, `Classes.hpp`, `d3d_Hook.cpp` (MinHook `MH_CreateHook`), `CustomWinApi.hpp`.
- Divergência: README chama de "external mod menu", mas o código é DLL interna (`DllMain` + hook de `Present`) — README não confere com o repo.
- Aproveitável: arquitetura internal DLL mínima — hook de `IDXGISwapChain::Present` + ImGui + wrappers `hk_*` + pattern scan como auto-offset. Código byte-idêntico ao asshetys9.

## asshetys9/FIVEM-Cheat-with-Lua-Executor-and-dumper
- ★ 1 · license Apache-2.0 · C++ · `main` · pushed 2026-10-15
- Features confirmadas: **idênticas ao khannedj** (`md5` de `Core.cpp` e `dllmain.cpp` iguais; `diff -q` de `Classes.hpp` vazio). Pattern scan para World/ReplayInterface/W2S/BonePos/Camera em `dllmain.cpp:57-61`. Lua executor e dumper do README **não existem no código** (grep `lua|dump` só hit no README).
- Arquivos-chave: mesmos do khannedj.
- Aproveitável: só como confirmação de fork; nenhum código próprio além do Mod-Menu.

## wezy04-cloud/-RELEASE-Cobalt-Open-Source-Loader
- **NÃO ENCONTRADO** — `gh repo view` retorna "Could not resolve to a Repository with the name". Sem clone, sem ficha.

## Device9999/FiveM-External-ESP
- ★ 44 · license **nenhum** (sem LICENSE file — all rights reserved, referência apenas) · linguagem não declarada (C++ no código) · `master` · pushed 2019-04-27
- Features confirmadas no código: ESP box + skeleton + distância/nome/arma (`esp/esp.cpp:349` `draw_esp`, `esp/esp.cpp:91-93` skeleton por pares de bones), world-to-screen com viewmatrix do viewport (`esp/esp.cpp:5-33`), bounding box por 8 pontos projetados (`esp/esp.cpp:35` `get_bounding_box`), aimbot simples por FOV com `mouse_event` (`aimbot/aimbot.cpp:4-27`), mods de veículo/godmode/seatbelt por escrita direta (`features/features.cpp:11-70`), teleport para waypoint/player escrevendo coordenada de navigation (`esp/esp.cpp:143-151`), replay interface para listar peds (`sdk/sdk.cpp:15-31`), overlay D3D9 com `DwmExtendFrameIntoClientArea` + `WS_EX_LAYERED|WS_EX_TRANSPARENT` (`overlay/overlay.cpp:136-148`), menu próprio com framework `c_menu_framework::add_entry` (`menu/menu.cpp:4-24`).
- Arquivos-chave: `gta_external/esp/esp.cpp`, `gta_external/memory/memory.hpp` (template RPM/WPM), `gta_external/sdk/sdk.cpp`, `gta_external/overlay/overlay.cpp`, `gta_external/aimbot/aimbot.cpp`, `gta_external/features/features.cpp`.
- Aproveitável: referência clássica de external 2019 — w2s, box, skeleton, replay interface, overlay layered. Offsets hardcoded com branch steam/non-steam (`esp.cpp:6`).

## huguluhu/fivem-external
- ★ 0 · license **nenhum** (sem LICENSE) · C++ · `main` · pushed 2026-10-25
- Features confirmadas (repo mais completo da lista): attach RPM com fallback de permissão (`src/core/memory.h:39-53` `Attach`), bloco de offsets comentado e retunable (`src/core/offsets.h`), world-to-screen por matriz 4x4 (`src/game/sdk.cpp:76-86`), ESP box por 3 bones + skeleton fixo de 20 pares (`src/features/esp.cpp:8-17`, `BuildBox` `esp.cpp:19-47`), aimbot com FOV, prioridade, switch delay, predição de projétil, smoothing com acumulador de resíduo (`src/features/aimbot.cpp:132-155`) e triggerbot integrado com delay (`aimbot.cpp:117-130`), overlay D3D11 próprio `WS_EX_TOPMOST|TRANSPARENT|LAYERED` (`src/ui/overlay.cpp:66-67`), engine Lua embutida com bindings de memória/w2s (`src/scripting/lua_engine.cpp:30-49`, `144-146`), config JSON em `./configs/`, menu ImGui, reattach automático a cada 2 s (`src/main.cpp:155-167`), loop principal com dt clampado (`main.cpp:143-146`).
- Arquivos-chave: `src/core/memory.h`, `src/core/offsets.h`, `src/features/aimbot.cpp`, `src/features/esp.cpp`, `src/game/sdk.cpp`, `src/ui/overlay.cpp`, `src/scripting/lua_engine.cpp`, `src/main.cpp`.
- Aproveitável: base externa mais completa — estrutura de pastas (core/features/game/ui/scripting/config), CMake, loop com reattach, Lua sandbox sobre RPM. Melhor referência de "external cheat típico" do map.

## nkga/cheat-driver
- ★ 320 · license MIT (`LICENSE.txt`) · C (WDM) · `master` · pushed 2018-05-10
- Features confirmadas: driver WDM de 130 linhas — `DriverEntry` cria device + symlink (`src/driver.c:115-127`), dispatch único para `IRP_MJ_CREATE/CLOSE/DEVICE_CONTROL` (`src/driver.c:69-95`), IOCTL `METHOD_BUFFERED` `CTL_CODE(..., 0x808, ...)` (`src/driver_codes.h:8`), struct `DRIVER_COPY_MEMORY {Source, Target, Size, ProcessId, Write}` (`src/driver_codes.h:11-17`), cópia cross-process via `MmCopyVirtualMemory` + `PsLookupProcessByProcessId`/`ObDereferenceObject` (`src/driver.c:27-56`).
- Arquivos-chave: `src/driver.c`, `src/driver_codes.h`, `src/driver_config.h`, `README.MD` (client `CreateFileW(DRIVER_DEVICE_PATH...)` + `DeviceIoControl`).
- Aproveitável: protótipo mínimo de canal usermode↔kernel para R/W — melhor base de IOCTL do pack. README documenta criação de serviço/`NtLoadDriver` e test-signing.

## DErDYAST1R/64KernelDriverCleaner
- ★ 229 · license CC BY-NC-ND 4.0 (`license` — sem derivados) · C++ · `main` · pushed 2026-04-23
- Features confirmadas: limpeza de caches de driver após carregamento — `LocatePiDDB` + `clearCache` (tabela PiDDB por `timeDateStamp`, `PiDDB/piddb.cpp:180,217`), `clearHashBucket` (`HashBucket/hash.cpp:11`), `GetMmuAddress`/`GetMmlAddress`/`CleanMmu` (`MMU_MML/mmu_mml.cpp:12,27,67`), orquestração em `CleanDriverSys` (`entry/main.cpp:38-58`), entry alternativa `OEPDriverEntry` (`entry/main.cpp:61`), pattern scan de kernel (`BBScanSection` `PiDDB/piddb.cpp:131`), string XOR (`xor.h`), resolução de endereço relativo (`ResolveRelativeAddress` `PiDDB/piddb.cpp:20`).
- Arquivos-chave: `PiDDB/piddb.cpp`, `HashBucket/hash.cpp`, `MMU_MML/mmu_mml.cpp`, `entry/main.cpp`, `global.h`, `xor.h`.
- Aproveitável: higiene de rastros de driver (complementa qualquer loader/kernel do pack). README declara limite: `PsLoadedModuleList` exige PG bypass em Win10 > 22H2.

## MicrosoftARMAssembler/Hyperspace
- ★ 100 · license **nenhum** (sem LICENSE) · C++ · `main` · pushed 2026-06-10
- Features confirmadas: solucao com 4 projetos (`bootstrapper`, `library`, `payload`, `internal` + `injector`). Manual map de driver: `c_map::create` aloca com `nt::mm_allocate_independent_pages`, seta proteção e aplica relocations (`bootstrapper/src/map/map.hxx:10-30`), resolve exports do ntoskrnl via PDB/DIA (`map.hxx:126,153` — `MmAllocateIndependentPagesEx`, buffers de símbolos), strings ofuscadas `oxorany` em todos os logs/exports. KEP hooks de kernel (`payload/src/mmu/core/kep/kep.hxx` — `create_hook` com validação de cave/bounds/exports) e uso de exports ETW (`map.hxx:123-124` — `EtwpMaxPmcCounter`, `EtwpDebuggerData`). Página hiding/remap em `payload/src/paging/{hide,hyperspace}`, MMU em `payload/src/mmu/`, client de request em `library/src/driver/driver.hxx:133` `send_request`. README documenta bypass de DSE, avoid de `PsLoadedModuleList`, page hiding p/ EAC (VM probes/NMI), physical memory mapping p/ evitar `MmCopyMemory`.
- Arquivos-chave: `bootstrapper/src/map/map.hxx`, `payload/src/mmu/core/kep/kep.hxx`, `payload/src/paging/`, `library/src/driver/driver.hxx`, `README.md`.
- Aproveitável: referência de manual map + higiene de páginas.Volume enorme (127k linhas fora deps) — usar como catálogo de técnicas, não como base de cópia.

## lateidev/XirLoader
- ★ 2 · license MIT · Python (CustomTkinter) · `main` · pushed 2026-06-21
- Features confirmadas (monólito `main.py`, 40.207 linhas): UI CustomTkinter com widgets animados (`ToggleSwitch` `main.py:24037`, dropdown animado `24760`), streamproof por `SetWindowDisplayAffinity(hwnd, 0x11)` = `WDA_EXCLUDEFROMCAPTURE` aplicado recursivamente em janelas/filhos (`main.py:29591-29600`, `29483`, `30978`), criptografia em memória própria — `_memory_encrypt`/`_memory_decrypt` com `VirtualProtect`↔`PAGE_EXECUTE_READWRITE` e chave por região (`main.py:26035,26062`), `_protected_regions` com encrypt em repouso e decrypt-on-use (`26097-26104`), anti-debug `IsDebuggerPresent`/`CheckRemoteDebuggerPresent` (`25695`, `26657-26663`), lista de APIs monitoradas (`ReadProcessMemory`, `VirtualAllocEx`, `CreateRemoteThread`, `NtCreateSection`... `25228-25230`), injeção com `ResumeThread` (`31276`), decoy memory (`_inject_decoy_memory_data` `27695`), auth/hwid/licença (`AuthSystemHybrid` `24347`), anti-tamper com `eval` de payload decriptografado (`26293`).
- Arquivos-chave: `main.py` (seções: UI 24k+, loader/segurança 25k-31k), `LICENSE`, `setup.py`.
- Aproveitável: streamproof (WDA_EXCLUDEFROMCAPTURE) é o achado principal p/ `overlay-render`; encrypt-at-rest de regiões de código é padrão p/ loader. Auth/screenshot AnyDesk = ruído, descartar.
