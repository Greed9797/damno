---
name: fivem-external
description: Pipeline de cheat externo FiveM/GTA V — processo FiveM_GTAProcess, offsets por build, entity walk via replay interface, ESP/aimbot/teleport por RPM/WPM.
---

# FiveM External

Cheat external para FiveM/GTA V: processo separado, `OpenProcess` + `ReadProcessMemory`/`WriteProcessMemory`, overlay próprio. Sem injeção, sem hook, sem natives — tudo é estado de memória do cliente.

## Quando usar

Quando o pedido for "cheat FiveM", "ESP FiveM", "mod menu FiveM externo", "aimbot GTA V", "teleport FiveM", "god mode FiveM" ou qualquer build que rode no processo `FiveM_GTAProcess.exe` / `FiveM_b<build>_GTAProcess.exe`. Se o pedido for internal DLL (hook de Present), rotear para `cheat-framework` + `overlay-render`.

## Workflow

1. **Processo** — achar por nome via Toolhelp (`FindProcess`) ou por janela (`FindWindow("grcWindow")` → `GetWindowThreadProcessId`). Nomes reais no código: `FiveM_GTAProcess.exe` (huguluhu `src/main.cpp:124`), `FiveM_b<build>_GameProcess.exe`/`_GTAProcess.exe` por build (SilentAim `Cheat/FivemSDK/Fivem.cpp:31-43`), fallback `GTA5.exe` (Device9999 `gta_external/overlay/overlay.cpp:82-96`). Abrir handle com `PROCESS_VM_READ|VM_WRITE|VM_OPERATION|QUERY_INFORMATION` e fallback read-only (huguluhu `src/core/memory.h:47-50`).
2. **Módulo base** — `CreateToolhelp32Snapshot(TH32CS_SNAPMODULE)` + `Module32First/Next` (`memory.h:13-25`). Base = início do `FiveM_*_GTAProcess.exe`.
3. **Offsets** — três rotas observadas: (a) bloco `namespace off` em header, retunable em runtime (huguluhu `src/core/offsets.h`); (b) tabela por build via `GetModuleHandleA("FiveM_bXXXX_GTAProcess.exe")` (khannedj `dllmain.cpp:65-170`, SilentAim `Fivem.cpp:31-430`); (c) pattern scan com RIP resolve (khannedj `dllmain.cpp:57-61`, WeanteX `WeanteX/Cheat/Game.hpp:92-121`). Escolher (b) para multi-build sem recompilar.
4. **Globals** — resolver `World`, `ReplayInterface`, `ViewPort`/`Camera`, `BlipList` a partir da base. Sanidade: ler ponteiro, checar ≠0 e coordenada plausível antes de usar (huguluhu `src/game/sdk.cpp:23-31` valida a viewmatrix; WeanteX `Game.hpp:160-166` só aceita o build se World/Viewport/Replay lerem ≠0).
5. **Local player** — `World + 0x8` (offset convergente: huguluhu `offsets.h:14`, khannedj `Classes.hpp:806`, WeanteX `Game.hpp:142`).
6. **Entity walk** — `ReplayInterface + 0x18` (ped interface) → `+ 0x100` (lista) / `+ 0x108` (count). Stride `i * 0x10` por ponteiro (SilentAim `Classes.hpp:331`, khannedj `Classes.hpp:768`, WeanteX `Cheat.hpp:372`). Clamp do count antes do loop (huguluhu `sdk.cpp:133`).
7. **Estado por ped** — health `+0x280`, max `+0x2A0`, armor, posição `+0x90`, invisible flag `+0x2C`, playerinfo `+0x10A8..0x10C8` (varia por build — ver tabela na skill), bones via fragment inst `+0x430`.
8. **w2s** — viewmatrix lida em `viewport + 0x24C`, transpose, projeção, rejeita `w <= 0.1` (Device9999 `esp/esp.cpp:5-33`, SilentAim `Fivem.cpp:984+`). Retornar `bool`, não sentinela `(0,0)`.
9. **Features** — leitura no loop principal (8 ms mínimo entre snapshots, huguluhu `main.cpp:174-179`); escrita em thread própria com 1–5 ms de tick (Device9999 `features/features.cpp:194-206`, SilentAim `Exploits.cpp:142-146`). Reattach a cada 2 s se o processo morrer (`main.cpp:157-170`).
10. **Overlay** — janela popup `WS_EX_TOPMOST|TRANSPARENT|LAYERED` sobre a janela do jogo (huguluhu `src/ui/overlay.cpp:67`), draw só no frame do overlay. Streamproof opcional: `SetWindowDisplayAffinity(hwnd, 0x11)` (XirLoader `main.py:29591-29600`).

## Referência técnica

### Offsets convergentes (confirmados em ≥2 repos)

| Campo | Offset | Evidência |
|---|---|---|
| World (base+X) | por build | huguluhu `offsets.h:9` `0x25B14A0` · SilentAim `Fivem.cpp:49` `0x252DCD8` (b2372) · WeanteX `Game.hpp:137` `0x25EC580` (3570) |
| ReplayInterface (base+X) | por build | huguluhu `offsets.h:10` · SilentAim `Fivem.cpp:50` · WeanteX `Game.hpp:138` |
| LocalPlayer | `World + 0x8` | huguluhu `offsets.h:14` · khannedj `Classes.hpp:806` · WeanteX `Game.hpp:142` |
| Ped list / count | iface `+0x100` / `+0x108`, stride `0x10` | SilentAim `Classes.hpp:331,346,354` · khannedj `Classes.hpp:768-786` |
| Posição | `ped + 0x90` (Vec3) | huguluhu `offsets.h:27` · Device9999 `sdk.hpp:77` · SilentAim `Classes.hpp:197` |
| Health / max | `ped + 0x280` / `+0x2A0` (float) | huguluhu `offsets.h:29-30` · Device9999 `sdk.hpp:81-83` · SilentAim `Classes.hpp:213` |
| Armor | `0x14B8`–`0x1530` (build-dependent) | khannedj `dllmain.cpp:68` `0x14B8` · SilentAim `Fivem.cpp:59` `0x14E0` · WeanteX `Game.hpp:148` `0x150C` |
| Invisible flag | `ped + 0x2C` (byte; write `0x1`/`0x37`) | Device9999 `features.cpp:79-86` · huguluhu `offsets.h:32` (bit0 em `0x2E`) |
| God mode byte | `ped + 0x189` (byte) | Device9999 `features.cpp:75` · SilentAim `Classes.hpp:166-172` |
| PlayerInfo | `0x10A8` / `0x10B8` / `0x10C8` (build) | huguluhu `offsets.h:34` · khannedj `dllmain.cpp:71` · SilentAim `Fivem.cpp:61` |
| Nome | playerinfo `+0x40` (huguluhu) / `+0x7C` (Device9999) | huguluhu `offsets.h:39` · Device9999 `sdk.hpp:136` |
| Weapon mgr / arma atual | `+0x10B8..0x10D8` / `+0x20` / hash `+0x60` | huguluhu `offsets.h:35,42-43` · Device9999 `features.cpp:133` |
| Last vehicle | `ped + 0xD28` / `0xD30` | Device9999 `features.cpp:7` · khannedj `Classes.hpp:632` |
| Viewmatrix | `viewport + 0x24C` (float[16]) | Device9999 `esp.cpp:7` · huguluhu `offsets.h:46` |
| View angles | `CCamFollowPedCamera + 0x40` (Vec3) | SilentAim `Classes.hpp:421-434` |
| Navigation (TP) | `nav + 0x50` (Vec3) + freeze `ModelInfo + 0x2C` | Device9999 `esp.cpp:147-148` · SilentAim `Fivem.cpp:965-981` |
| Blip list / waypoint | base+`0x1F9FFA0`..`0x206B4E0` (build); blip `+0x40` icon, `+0x48` color, `+0x10` pos; icon 8 / color 84 = waypoint | Device9999 `esp.cpp:122-151` · SilentAim `Exploits.cpp:95-140` |
| Bones | frag inst `+0x430`; array por `frag+0x1A0` (stride `0x70`, off `0x10`) | huguluhu `offsets.h:33`, `sdk.cpp:88-95`, `globals.h:23-25` · SilentAim `Fivem.cpp:60,64,741` |
| Build tables | b2060/b2189/b2372/b2545/b2612/b2699/b2802/b2944/b3095 | khannedj `dllmain.cpp:65-170` · SilentAim `Fivem.cpp:31-430` · WeanteX `Game.hpp:137+` (3570..2699) |

### Padrões de feature (o que o código faz de verdade)

- **Teleport** — escreve `Object+0x90` (visual) e `Navigation+0x50` (destino), com freeze `ModelInfo+0x2C=0` antes e restore 40 ms depois (SilentAim `Fivem.cpp:965-981`). Waypoint = scan de 2000 blips filtrando icon/color (Device9999 `esp.cpp:122-151`).
- **God** — byte `0x189 = 1` por tick; semi-god = reescreve health/max e armor (Device9999 `features.cpp:74-105`).
- **Aimbot mouse** — seleção por métrica de tela + FOV, smooth `delta/smooth` com clamp e resíduo sub-pixel entre frames (huguluhu `aimbot.cpp:51-155`).
- **Aimbot ângulo** — ler/escrever viewangles em `camera+0x40`, smooth horizontal/vertical separados (SilentAim `Fivem.cpp:929-960`).
- **Silent aim** — JMP `E9` de `HandleBullet` (por build) para cave no módulo que sobrescreve o fim do ray com a coordenada do alvo; restore = bytes originais (SilentAim `SilentAim.cpp:8-90`, WeanteX `Cheat.hpp:1130-1150`).
- **Triggerbot** — `PlayerAimingAt` (ponteiro do alvo mirado) + `bIsPlayerAiming` (bool global), delay por reação, `SendInput` (SilentAim `TriggerBot.cpp:9-85`); variante por raio de tela com timer (huguluhu `aimbot.cpp:118-130`).
- **Invisível** — write `0x2C = 0x1` / restaura `0x37` (Device9999 `features.cpp:79-86`).
- **Money/wanted** — nenhum repo escreve; só struct fields sem uso (Device9999 `sdk.hpp:121,149`). Não inventar.

### Natives não existem do lado externo

Nenhum external chama native do FiveM/GTA (grep `GetNativeHandler|scrProgram|lua_State` = 0 nos externos). Quem precisa de native está no internal (`cheat-framework` rota interna). Executor Lua do FiveM (scrThread) não existe em nenhum repo do map — só sandbox próprio sobre RPM (huguluhu `lua_engine.cpp:144-165`), coberto por `lua-ui`.

## Exemplo

Módulo ESP FiveM external (C++), padrão huguluhu/Device9999 — walk + w2s + box/skeleton:

```cpp
// fivem_esp.cpp — módulo ESP FiveM external (RPM puro)
#include <windows.h>
#include <cstdint>
#include <cmath>
#include <vector>

namespace off {  // base: namespace off por build (ver Referência técnica)
    constexpr uintptr_t World           = 0x25B14A0;
    constexpr uintptr_t ReplayInterface = 0x1FEAAC0;
    constexpr uintptr_t ViewPort        = 0x24C0B00;
    constexpr uintptr_t LocalPlayer     = 0x08;
    constexpr uintptr_t PedIface        = 0x18;
    constexpr uintptr_t PedList         = 0x100;
    constexpr uintptr_t PedCount        = 0x108;
    constexpr uintptr_t Position        = 0x90;
    constexpr uintptr_t Health          = 0x280;
    constexpr uintptr_t PlayerInfo      = 0x10A8;
    constexpr uintptr_t NameOff         = 0x40;
}

static HANDLE g_h = nullptr;
static uintptr_t g_base = 0;

template <class T> bool Read(uintptr_t a, T& out) {
    SIZE_T n = 0;
    return g_h && ReadProcessMemory(g_h, (LPCVOID)a, &out, sizeof(T), &n) && n == sizeof(T);
}

struct Ent { uintptr_t ped; float hp; float x, y, z; char name[32]; };

static bool W2S(float wx, float wy, float wz, float vw, float vh, float& sx, float& sy) {
    float m[16];
    uintptr_t vp = 0;
    if (!Read(g_base + off::ViewPort, vp) || !vp) return false;
    if (!Read(vp + 0x24C, m)) return false;
    // viewmatrix lida em linha; projeção com w > 0 na frente da câmera
    float cw = m[3]*wx + m[7]*wy + m[11]*wz + m[15];
    if (cw < 0.001f) return false;
    float cx = m[0]*wx + m[4]*wy + m[8]*wz  + m[12];
    float cy = m[1]*wx + m[5]*wy + m[9]*wz  + m[13];
    float inv = 1.f / cw;
    sx = (vw * 0.5f) * (1.f + cx * inv);
    sy = (vh * 0.5f) * (1.f - cy * inv);
    return true;
}

static std::vector<Ent> Snapshot() {
    std::vector<Ent> out;
    uintptr_t world = 0, replay = 0, local = 0;
    if (!Read(g_base + off::World, world) || !world) return out;
    if (!Read(world + off::LocalPlayer, local) || !local) return out;
    if (!Read(g_base + off::ReplayInterface, replay) || !replay) return out;

    uintptr_t iface = 0;
    if (!Read(replay + off::PedIface, iface) || !iface) return out;
    uintptr_t list = 0; int32_t count = 0;
    if (!Read(iface + off::PedList, list) || !list) return out;
    if (!Read(iface + off::PedCount, count)) return out;
    if (count < 0) count = 0;
    if (count > 256) count = 256;          // clamp — contagem corrompida vira recusa, não lixo

    for (int32_t i = 0; i < count; i++) {
        uintptr_t ped = 0;
        if (!Read(list + (uintptr_t)i * 0x10, ped) || !ped) continue;  // stride 0x10
        Ent e{};
        if (!Read(ped + off::Health, e.hp)) continue;
        if (!std::isfinite(e.hp) || e.hp > 100000.f) continue;         // sanity
        if (!Read(ped + off::Position, e.x)) continue;
        Read(ped + off::Position + 4, e.y);
        Read(ped + off::Position + 8, e.z);
        if (std::fabs(e.x) > 100000.f) continue;
        uintptr_t pi = 0;
        if (Read(ped + off::PlayerInfo, pi) && pi) {
            Read(pi + off::NameOff, e.name);  // char[32]
            e.name[31] = 0;
        }
        e.ped = ped;
        if (e.hp > 0.f && ped != local) out.push_back(e);
    }
    return out;
}

void DrawEsp(ImDrawList* dl, float sw, float sh) {
    for (auto& e : Snapshot()) {
        float sx, sy;
        if (!W2S(e.x, e.y, e.z, sw, sh, sx, sy)) continue;
        // box: projetar foot e derivar altura (padrão huguluhu esp.cpp:22-47)
        float top = sy - 90.f * (sh / 1080.f);
        float w = (sy - top) * 0.42f;
        dl->AddRect(ImVec2(sx - w*0.5f, top), ImVec2(sx + w*0.5f, sy),
                    IM_COL32(0, 255, 0, 255));
        char buf[64];
        snprintf(buf, sizeof(buf), "%.0fm %s", /*dist*/ 0.f, e.name);
        dl->AddText(ImVec2(sx, top - 14.f), IM_COL32(255,255,255,255), buf);
    }
}
```

Loop de integração (padrão huguluhu `main.cpp:145-197`):

```cpp
while (running) {
    if (!Alive()) { /* reattach a cada 2 s */ Attach(L"FiveM_GTAProcess.exe"); }
    if (attached && sinceSnapshot > 0.008f) { /* snapshot 8 ms */ }
    if (overlay.BeginFrame()) { DrawEsp(dl, sw, sh); overlay.EndFrame(); }
    Sleep(1);
}
```

## Armadilhas

- **Processo errado**: attach em `FiveM.exe` (launcher) não tem offsets — o engine é `FiveM_GTAProcess.exe` ou `FiveM_b<build>_GTAProcess.exe`. Detectar por janela `grcWindow`/`CfxWindow` e confirmar o nome do módulo (huguluhu `main.cpp:59,72-73,124`).
- **Stride da entity list**: 4 de 5 repos usam `i * 0x10`; huguluhu usa `i * 8` (`sdk.cpp:136`). Trocar stride sem conferir a base da lista lê metade dos peds ou ponteiro torto — testar com contagem conhecida (2+ peds) antes de confiar.
- **Natives não existem do lado externo**: `GET_PED_...`, `SET_...` não estão disponíveis em RPM. Tudo que "parece native" é offset de struct ou patch de código — se a feature só existe como native, é rota internal (`cheat-framework`).
- **Offsets por build**: World/ReplayInterface/ViewPort mudam a cada build do FiveM (tabelas em khannedj `dllmain.cpp:65-170`, SilentAim `Fivem.cpp:31-430`). Offsets fixos sem tabela de build quebram no update; preferir tabela por nome de módulo ou pattern scan.
- **Count corrompido**: `PedCount` sem clamp vira loop gigante/RPM falho (huguluhu `sdk.cpp:133` clampa em 256; sempre: `count < 0 → 0`, teto fixo).
- **Leitura parcial vira lixo**: `ReadProcessMemory` retorna sucesso parcial — checar `bytesRead == sizeof(T)` (huguluhu `memory.h:70-74` fail closed). Sem isso, health vira NaN e ESP desenha posição fantasma.
- **Teleport por write de `Navigation+0x50`**: é escrita de coordenada no cliente — o servidor OneSync mantém autoridade de posição/estado no servidor, então o valor escrito pode ser ressincronizado ou divergir do estado do servidor. Fato do mecanismo: o cheat escreve só memória local do cliente; nenhum repo dos 9 fala com o netcode do servidor (grep net/packet = 0). Não afirmar "bypassa OneSync" — o código não mostra isso.
- **Silent aim reescreve `.text`**: cave em `base+0x34E` / offset por build — precisa de permissão de escrita na região executável e restore obrigatório (bytes originais em `SilentAim.cpp:8-27`); crash garantido se o processo morrer com o JMP pendurado.
- **God mode por byte**: `0x189` é reescrito por tick — se parar de escrever (thread morreu), flag volta ao valor do jogo no próximo tick de física. Restaurar explicitamente ao desligar (Device9999 `features.cpp` faz toggle, SilentAim tem `godmode_off`).
- **Viewmatrix candidates**: huguluhu prova 3 fontes (direto no base, ponteiro+`0x24C`, ponteiro direto) com validação de plausibilidade (`sdk.cpp:23-59`) — usar 1 fixo sem validação quebra com update de build.
- **Ligação com o pack**: entity walk/w2s → `esp`; seleção/smooth de mira → `aimbot` + `cheat-humanization`; attach/handle/reattach → `attach-offsets`; janela overlay/DPI/click-through → `overlay-render`; AOB p/ novos builds → `memory-scanning` + `offset-toolchain`.
