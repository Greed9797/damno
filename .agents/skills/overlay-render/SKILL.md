---
name: overlay-render
description: Overlay sobre o jogo em dois modos — hook de Present (SwapBuffers/vkQueuePresentKHR) interno ou janela layered externa — com DPI, multi-monitor, fullscreen e click-through.
---

# Overlay Render

A camada visível por cima do jogo: ou desenhando dentro do processo hospedeiro no hook de present, ou numa janela separada transparente por cima do HWND do jogo.

## Quando usar

Quando o pedido for "overlay", "desenhar por cima do jogo", "janela transparente", "hook no Present", "ImGui no jogo", "ESP em C++ externo", "overlay não aparece" ou "overlay atrapalha o mouse".

## Workflow

1. **Escolher o modo** — interno (hook) ou externo (janela). Externo por padrão.
2. **Achar o alvo** — HWND do jogo (externo) ou a swapchain/hook de present (interno).
3. **Criar a superfície** — janela layered ou hook instalado.
4. **Ajustar DPI** — per-monitor awareness antes de qualquer cálculo.
5. **Ancorar** — posição/tamanho sincronizados com o cliente do jogo.
6. **Desenhar** — loop de render fora da game thread.
7. **Input** — click-through ligado, exceto quando o menu está aberto.
8. **Teardown** — remover hook, destruir janela, matar timers.

## Referência técnica

### Modo A — interno (hook de present)

| API | Ponto de hook |
|---|---|
| D3D11 | `IDXGISwapChain::Present` |
| D3D12 | `IDXGISwapChain3::Present` (mesmo vtable) |
| OpenGL | `wglSwapBuffers` |
| Vulkan | `vkQueuePresentKHR` |

- Instalar com MinHook ou trampolim equivalente; obter o vtable a partir de um device criado no próprio processo.
- Hook precisa repassar para o original e não bloquear a game thread.
- Superfície de detecção maior: módulo injetado + hook de função de render.

**Cuidados de D3D11/12**

- Recriar o render target quando a swapchain é resize (`ResizeBuffers`).
- D3D12 exige command queue e fence próprios; não compartilhar com a game queue sem sincronização.
- Não chamar funções de UI dentro do hook se elas alocarem na heap da game thread.

### Modo B — externo (janela layered)

```text
style = WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT | WS_EX_LAYERED
```

- `WS_EX_LAYERED` + `SetLayeredWindowAttributes` (ou `UpdateLayeredWindow`) para transparência.
- `WS_EX_TRANSPARENT` dá click-through; desligar quando o menu abre.
- `WS_EX_TOOLWINDOW` evita entrada na taskbar e Alt+Tab.
- Reposicionar com `SetWindowPos(HWND_TOPMOST, ...)` após qualquer mudança de z-order do jogo.
- Alternativa: janela borderless com D3D11 e composição por alpha, sem `WS_EX_LAYERED`.

### Checklist de integração

- **DPI** — `SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)`; sem isso, coordenadas erradas em monitor com escala ≠ 100%.
- **Multi-monitor** — `MonitorFromWindow` + `GetMonitorInfo`; calcular o offset do monitor, não assumir (0,0).
- **Exclusive fullscreen** — janela layered não aparece sobre exclusive; exigir borderless fullscreen ou hook interno.
- **Frame pacing** — overlay em timer próprio; nunca bloquear o Present da game thread.
- **Input pass-through** — alternar `WS_EX_TRANSPARENT` no toggle do menu; sem isso o menu não recebe clique.
- **Z-order** — reaplicar topmost após o jogo mudar para borderless/resizable.
- **Performance** — modo de render full-screen quando o ESP atrasa; desenhar só o que mudou.

## Exemplo

Janela overlay externa em C++:

```cpp
// overlay_window.cpp - layered click-through overlay on top of a game window
#include <windows.h>

static const wchar_t* kWndClass = L"OverlayWnd";

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    if (msg == WM_DESTROY) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

int RunOverlay(HWND game) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    WNDCLASSEXW wc = { sizeof(wc) };
    wc.lpfnWndProc   = WndProc;
    wc.hInstance     = GetModuleHandleW(nullptr);
    wc.hCursor       = LoadCursorW(nullptr, IDC_ARROW);
    wc.lpszClassName = kWndClass;
    RegisterClassExW(&wc);

    RECT gr{};
    GetClientRect(game, &gr);
    POINT origin{0, 0};
    ClientToScreen(game, &origin);

    HMONITOR mon = MonitorFromWindow(game, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi = { sizeof(mi) };
    GetMonitorInfoW(mon, &mi);

    HWND ov = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT | WS_EX_LAYERED,
        kWndClass, L"overlay", WS_POPUP,
        origin.x, origin.y,
        gr.right - gr.left, gr.bottom - gr.top,
        nullptr, nullptr, wc.hInstance, nullptr);

    SetLayeredWindowAttributes(ov, 0, 255, LWA_ALPHA);
    ShowWindow(ov, SW_SHOWNOACTIVATE);
    SetWindowPos(ov, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

    MSG msg{};
    while (msg.message != WM_QUIT) {
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        // draw frame here; never block on the game thread
        Sleep(1);
    }
    DestroyWindow(ov);
    return 0;
}
```

Hook de Present com MinHook (pseudo-real):

```cpp
// present_hook.cpp - draw on top of D3D11 swapchain
#include <d3d11.h>
#include <dxgi.h>
#include <MinHook.h>

using PresentFn = HRESULT(__stdcall*)(IDXGISwapChain*, UINT, UINT);
static PresentFn oPresent = nullptr;

static HRESULT __stdcall hkPresent(IDXGISwapChain* sc, UINT sync, UINT flags) {
    static bool init = false;
    if (!init) {
        // create/render targets from sc->GetBuffer(0) here
        init = true;
    }
    // draw overlay commands here
    return oPresent(sc, sync, flags);
}

bool InstallPresentHook(IDXGISwapChain* sc) {
    void** vt = *reinterpret_cast<void***>(sc);
    void* target = vt[8]; // IDXGISwapChain::Present
    if (MH_CreateHook(target, &hkPresent, reinterpret_cast<void**>(&oPresent)) != MH_OK)
        return false;
    return MH_EnableHook(target) == MH_OK;
}
```

Alternar click-through no toggle do menu:

```cpp
static void SetMenuMode(HWND ov, bool menu_open) {
    LONG_PTR ex = GetWindowLongPtrW(ov, GWL_EXSTYLE);
    if (menu_open) ex &= ~static_cast<LONG_PTR>(WS_EX_TRANSPARENT);
    else           ex |=  static_cast<LONG_PTR>(WS_EX_TRANSPARENT);
    SetWindowLongPtrW(ov, GWL_EXSTYLE, ex);
}
```

## Armadilhas

- Exclusive fullscreen esconde overlay externo; usar borderless ou hook interno.
- DPI unaware calcula tamanho errado no monitor secundário com escala diferente.
- Bloquear dentro do hook `Present` gera stutter visível no jogo.
- `WS_EX_TRANSPARENT` sempre ligado torna o menu impossível de clicar.
- Não repassar a chamada original do `Present` congela o jogo.
- Recriar render target só uma vez quebra após `ResizeBuffers` ou troca de resolução.
- Assumir origem em (0,0) ignora o offset do monitor e desenha fora da tela.
- Topmost perdido após o jogo alternar para borderless exige reaplicar z-order.
- Deixar a janela viva após o jogo fechar parece ferramenta em background.
