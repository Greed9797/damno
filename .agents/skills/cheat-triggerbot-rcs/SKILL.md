---
name: cheat-triggerbot-rcs
description: Triggerbot por alvo sob crosshair com delay randomizado e DPS cap, mais compensação de recuo (RCS) por view-kick com limite de taxa e toggle por arma.
---

# Triggerbot + RCS

Dois módulos que normalmente andam juntos: disparo automático quando a mira cruza um alvo válido, e compensação do recuo acumulado durante o spray.

## Quando usar

Quando o pedido for "triggerbot", "atirar sozinho quando passa em cima", "RCS", "compensar recuo", "no-recoil configurável", "spray control" ou "o tiro está disparando rápido demais".

## Workflow

### Triggerbot

1. **Guard de estado** — alive, round ativo, menu fechado, chat fechado, janela do jogo em foco.
2. **Filtro de alvo** — alive, time adversário, visível.
3. **Check de crosshair** — raycast do centro da tela até o osso, ou flag de occlusão lida da entity.
4. **Reaction delay** — sortear 140–320ms no primeiro frame com alvo sob a mira; sem novo sorteio enquanto o alvo não mudar.
5. **Guard de cooldown** — respeitar `60/fire_rate_ms`; sem isso o DPS vira assinatura.
6. **Fire** — `mouse_event`/`SendInput` ou escrever o bit do botão no `CUserCmd` do tick.
7. **Reset** — limpar estado quando não há alvo.

### RCS

1. **Ler view-kick** — Source: `m_aimPunchAngle` escalado por `m_aimPunchScale`; UE: curva de recoil por arma; fallback: delta de viewangles pós-tiro.
2. **Acumular delta** — guardar o desvio por tiro em vez de por frame.
3. **Compensar** — aplicar `-Δpunch` em pitch/yaw com cap em deg/s.
4. **Delay de ativação** — só começar após N tiros do spray (ex.: 2–3).
5. **Toggle por arma** — config por arma; single-shot não tem recuo a compensar.

## Referência técnica

### Filtro de crosshair

```text
crosshair = center of viewport
ray       = from eye along forward
hit       = Trace(eye, eye + forward*dist, mask)
valid     = hit.entity ~= local and hit.entity.team ~= localTeam
            and hit.entity.alive
```

- Alternativa barata quando existe: ler o ID do alvo sob a mira direto da memória do jogo.
- O check tem que ser por frame; um alvo que apareceu e saiu em 1 tick não deve disparar.

### Reaction delay

- Distribuição uniforme ou normal truncada em `[react_min, react_max]`.
- Guardar o valor sorteado por evento de "novo alvo sob a mira"; não re-sortear a cada frame.
- Estímulo repetido no mesmo alvo em <40ms não reinicia o timer.

### Fire paths

| Caminho | Quando | Nota |
|---|---|---|
| `mouse_event` / `SendInput` | External, input real | Simples; jogo vê evento de SO |
| `SetCursorPos` + click | External legado | Quebra em raw input |
| `CUserCmd` buttons | Internal, Source | Precisa hook de CreateMove |
| Write em input action | Internal, UE | Depende da versão da engine |

### RCS — leitura e escala

```text
punch = read_vec3(base + m_aimPunchAngle)
scale = read_vec3(base + m_aimPunchScale)
kick  = punch * scale
target_pitch = view_pitch - kick.x
target_yaw   = view_yaw   - kick.y
```

- Aplicar com cap: `max_deg_per_s` tipicamente 250–600, dependendo da arma.
- Compensação total instantânea no mesmo tick do tiro é assinatura; distribuir a correção em 2–4 ticks.

### Config por arma

```text
weapons."ak47"  = { fire_rate_ms = 100, rcs = true,  start_after = 3, max_deg_s = 480 }
weapons."awp"   = { fire_rate_ms = 1450, rcs = false, start_after = 0, max_deg_s = 0 }
weapons."deagle" = { fire_rate_ms = 267, rcs = true,  start_after = 2, max_deg_s = 320 }
```

## Exemplo

```lua
-- trigger_rcs.lua
local T = {
  enabled       = false,
  rcs_enabled   = false,
  ads_only      = true,
  react_min     = 0.140,
  react_max     = 0.320,
  fov_px        = 6.0,          -- crosshair tolerance in screen pixels
  max_deg_s     = 480.0,
  weapons = {
    ak47  = { fire_rate_ms = 100,  rcs = true,  start_after = 3 },
    awp   = { fire_rate_ms = 1450, rcs = false, start_after = 0 },
    deagle= { fire_rate_ms = 267,  rcs = true,  start_after = 2 },
  },
}

local S = {
  target_id  = nil,
  react_left = 0,
  next_fire  = 0,
  spray_n    = 0,
}

local function now()
  return os.clock()
end

local function rand_range(a, b)
  return a + math.random() * (b - a)
end

local function weapon_cfg(name)
  return T.weapons[name] or { fire_rate_ms = 120, rcs = false, start_after = 99 }
end

local function guard_ok(ctx)
  if not T.enabled then return false end
  if not ctx.alive or not ctx.round_active then return false end
  if ctx.menu_open or ctx.chat_open then return false end
  if not ctx.window_focused then return false end
  if T.ads_only and not ctx.aiming then return false end
  return true
end

local function crosshair_target(ctx)
  local best = nil
  local best_d = T.fov_px
  for _, e in ipairs(ctx.candidates) do
    if e.alive and e.team ~= ctx.local_team and e.visible then
      local d = math.sqrt(e.sx*e.sx + e.sy*e.sy) -- offset from screen center
      if d < best_d then best, best_d = e, d end
    end
  end
  return best
end

function T.triggerTick(ctx, dt)
  if not guard_ok(ctx) then S.target_id, S.react_left = nil, 0; return end

  local t = crosshair_target(ctx)
  if not t then
    S.target_id, S.react_left = nil, 0
    return
  end

  if S.target_id ~= t.id then
    S.target_id  = t.id
    S.react_left = rand_range(T.react_min, T.react_max)
    return
  end

  if S.react_left > 0 then
    S.react_left = S.react_left - dt
    return
  end

  local cfg = weapon_cfg(ctx.weapon)
  local t_now = now()
  if t_now < S.next_fire then return end
  if not t.onscreen then return end

  ctx.fire()
  S.next_fire = t_now + cfg.fire_rate_ms / 1000.0
end

function T.rcsTick(ctx, dt)
  if not T.rcs_enabled or not guard_ok(ctx) then S.spray_n = 0; return end
  local cfg = weapon_cfg(ctx.weapon)
  if not cfg.rcs then S.spray_n = 0; return end

  local punch = ctx.read_punch_angle()
  if not punch then return end

  if ctx.firing then
    S.spray_n = S.spray_n + 1
  else
    if S.spray_n > 0 then S.spray_n = math.max(0, S.spray_n - 1) end
  end
  if S.spray_n < cfg.start_after then return end

  local max_step = T.max_deg_s * dt
  local dx = -punch.x
  local dy = -punch.y
  local mag = math.sqrt(dx*dx + dy*dy)
  if mag > max_step then
    local k = max_step / mag
    dx, dy = dx*k, dy*k
  end

  ctx.set_view(ctx.pitch + dx, ctx.yaw + dy)
end
```

Hotkeys:

```lua
local hk_trigger = createHotkey(function() T.enabled = not T.enabled end)
hk_trigger.keys = VK_XBUTTON1

local hk_rcs = createHotkey(function() T.rcs_enabled = not T.rcs_enabled end)
hk_rcs.keys = VK_F2
```

## Armadilhas

- Disparar sem cap de DPS no cooldown da arma é a assinatura mais óbvia de triggerbot.
- RCS ativo em arma de tiro único (AWP, pistola) aplica compensação inexistente e puxa a mira para baixo.
- Sem guard de menu/chat/round, o trigger dispara ao fechar o menu e mata um aliado.
- Reaction delay fixo em 200ms é detectável; sortear por alvo.
- Compensar recuo no mesmo tick do tiro remove qualquer curva e aparece nos logs.
- `m_aimPunchAngle` não escalado subestima o kick e o RCS fica fraco.
- `CUserCmd` com bit de botão escrito em tick errado não dispara (o servidor só lê o tick válido).
- `fov_px` alto demais dispara em inimigo que está no canto da tela.
