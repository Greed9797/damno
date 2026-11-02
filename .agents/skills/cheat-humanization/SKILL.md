---
name: cheat-humanization
description: Modelo perceptual e control stack para aim que parece humano — reaction delay variável, pathing com easing/spring, ruído OU, deadzone, lead de projétil e histerese de alvo.
---

# Cheat Humanization

Camada entre a decisão de mirar e o movimento final: transforma um snap de ângulo em trajetória com latência, overshoot, ruído e correção, do jeito que uma mão humana produz.

## Quando usar

Quando o pedido for "humanizar o aim", "suavizar sem parecer bot", "reaction time realista", "adicionar overshoot", "mexer em smoothing/jitter", "o aim está travado demais" ou "fazer o lock não parecer lock".

## Workflow

1. **Selecionar alvo** — cone FOV 3D, LOS, e um score que combina ângulo, distância, ameaça e visibilidade. Sem isso, todo o resto é cosmético.
2. **Decidir engajar** — gatilho de input (tecla/botão) + guard de estado (menu, chat, round, alive).
3. **Aplicar latência** — sortear reaction delay por evento novo de estímulo, não por frame.
4. **Pathing** — gerar trajetória do ângulo delta: ease-in-out, mola criticamente amortecida ou Bezier quadrática.
5. **Injetar ruído** — Ornstein-Uhlenbeck ou ruído band-limited em yaw/pitch, magnitude proporcional ao erro.
6. **Deadzone** — erro abaixo de um piso não gera correção; evita micro-twitch de robô.
7. **Velocity match** — compensar lead de projétil e queda com o tempo de voo estimado.
8. **Clampar** — velocidade angular máxima por tick; nunca escrever delta inteiro de uma vez.
9. **Histerese** — trocar de alvo só quando o desafiante vence o atual por um Δ por N ticks.
10. **Release** — no death do alvo, continuar seguindo a velocidade por 80–150ms e decair.

## Referência técnica

### Modelo perceptual

- **Reaction delay**: base log-normal, `mu ~ 5.3` (≈200ms), `sigma ~ 0.35`; clamp 120–280ms. Nunca constante — constante é assinatura estatística.
- **Overshoot/correction**: com `p = overshoot_prob` (~0.15), passar 2–6% além do alvo e corrigir em 1–2 ticks.
- **Custo de troca de alvo**: 30–80ms extras no primeiro tick após retarget.
- **Jitter floor**: dois estímulos iguais no mesmo alvo em <40ms não geram segunda reação.
- **Mouse accel/raw input**: se o jogo usa raw input, o delta de viewangle não é o delta de mouse; calibrar no espaço de ângulo, não em pixels.

### Score de seleção

```text
score = w1*(1 - fov/fov_max)
      + w2*(1 - dist/dist_max)
      + w3*threat
      + w4*visible
```

- `fov` = distância angular real `hypot(dPitch, dYaw)`.
- `visible` = 1 se há LOS no bone; senão 0 (ou penalidade forte).
- `threat` = quem está apontando para você / mais próximo do crosshair.

### Pathing

- **Ease-in-out**: `t' = t*t*(3-2*t)`; mapeia progresso normalizado.
- **Mola criticamente amortecida**: `x'' = -k*x - 2*sqrt(k)*x'`, integrado por tick; `k` controla tempo de acomodação.
- **Bezier**: controle no ponto médio deslocado perpendicularmente ao delta para arco sutil.

### Ruído

- **Ornstein-Uhlenbeck**: `x += theta*(mu - x)*dt + sigma*sqrt(dt)*N(0,1)`; `theta` alto = ruído que volta rápido ao centro.
- **Band-limited**: filtrar ruído branco em ~2–6Hz; acima disso parece tremor de servo.
- Magnitude em graus, tipicamente 0.02–0.15° por tick no erro residual.

### Lead de projétil

```text
t     = dist / proj_speed
lead  = v_target * t
drop  = 0.5 * g * t^2
```

- Iterar uma vez: recalcular `t` com a posição já deslocada; duas iterações raramente mudam o resultado.
- Para hitscan, `lead` e `drop` são zero; só o delay perceptual importa.

### Anti-assinatura

- Não alinhar correções com net tick: jitter de ±meio frame no momento da escrita.
- Não manter lock perfeito por mais de N ticks (ex.: 12–20); inserir folga.
- Release suave no death: decair a velocidade de track em vez de cortar.

## Exemplo

```lua
-- humanized_aim.lua
local H = {
  fov_max      = 18.0,
  max_rate     = 220.0,     -- deg/s
  react_mu     = 5.3,       -- log-normal location ~ 200ms
  react_sigma  = 0.35,
  overshoot_p  = 0.15,
  deadzone     = 0.08,      -- degrees
  ou_theta     = 6.0,
  ou_sigma     = 0.05,
  switch_pen   = 0.05,      -- extra seconds on retarget
}

local state = {
  target      = nil,
  react_left  = 0,
  ou_yaw      = 0,
  ou_pitch    = 0,
  overshoot   = false,
  hold_ticks  = 0,
}

local function lognormal(mu, sigma)
  local u1 = math.random()
  local u2 = math.random()
  local z = math.sqrt(-2*math.log(u1)) * math.cos(2*math.pi*u2)
  return math.exp(mu + sigma*z) / 1000.0 -- ms -> s
end

local function angDist(ax, ay, bx, by)
  local dx = ((bx - ax + 180) % 360) - 180
  local dy = by - ay
  return math.sqrt(dx*dx + dy*dy)
end

local function score(ent, cur_yaw, cur_pitch)
  local fov = angDist(cur_yaw, cur_pitch, ent.yaw, ent.pitch)
  local s = 0.55*(1 - fov/H.fov_max)
          + 0.25*(1 - math.min(ent.dist / 1200.0, 1))
          + 0.15*(ent.threat and 1 or 0)
          + 0.05*(ent.visible and 1 or 0)
  return s, fov
end

local function select_target(cands, cur_yaw, cur_pitch, dt)
  local best, best_s = nil, -1
  for _, e in ipairs(cands) do
    if not e.alive then goto continue end
    if not e.visible then goto continue end
    local s, fov = score(e, cur_yaw, cur_pitch)
    if fov > H.fov_max then goto continue end
    if not best or s > best_s then best, best_s = e, s end
    ::continue::
  end
  if not best then return nil end
  if state.target and best.id ~= state.target.id then
    state.react_left = state.react_left + H.switch_pen
    state.hold_ticks = 0
  end
  return best
end

local function ou(prev, theta, sigma, dt)
  local n = (math.random() - 0.5) * 2
  return prev + theta*(0 - prev)*dt + sigma*math.sqrt(dt)*n
end

local function ease_in_out(t)
  return t*t*(3 - 2*t)
end

function H.tick(ctx, dt)
  if not ctx.engaged then state.target = nil; return ctx end

  local t = select_target(ctx.candidates, ctx.yaw, ctx.pitch, dt)
  if not t then state.target = nil; return ctx end

  if not state.target or state.target.id ~= t.id then
    state.target = t
    state.react_left = lognormal(H.react_mu, H.react_sigma)
    state.overshoot = false
  end

  if state.react_left > 0 then
    state.react_left = state.react_left - dt
    return ctx
  end

  local d_yaw   = ((t.yaw - ctx.yaw + 180) % 360) - 180
  local d_pitch = t.pitch - ctx.pitch
  if math.sqrt(d_yaw*d_yaw + d_pitch*d_pitch) < H.deadzone then
    return ctx
  end

  local prog = 1.0
  state.overshoot = state.overshoot or (math.random() < H.overshoot_p)
  if state.overshoot then prog = 1.0 + 0.03 * (math.random()*2 - 1) end

  local step_yaw   = d_yaw   * ease_in_out(math.min(1, prog))
  local step_pitch = d_pitch * ease_in_out(math.min(1, prog))

  state.ou_yaw   = ou(state.ou_yaw,   H.ou_theta, H.ou_sigma, dt)
  state.ou_pitch = ou(state.ou_pitch, H.ou_theta, H.ou_sigma, dt)
  step_yaw   = step_yaw   + state.ou_yaw
  step_pitch = step_pitch + state.ou_pitch

  local max_step = H.max_rate * dt
  local mag = math.sqrt(step_yaw*step_yaw + step_pitch*step_pitch)
  if mag > max_step then
    local k = max_step / mag
    step_yaw, step_pitch = step_yaw*k, step_pitch*k
  end

  ctx.yaw   = ((ctx.yaw + step_yaw + 180) % 360) - 180
  ctx.pitch = math.max(-89, math.min(89, ctx.pitch + step_pitch))
  state.hold_ticks = state.hold_ticks + 1
  if state.hold_ticks > 18 then state.overshoot = false end
  return ctx
end

return H
```

Configuração externa versionada:

```json
{
  "fov_max": 18.0,
  "max_rate": 220.0,
  "react_mu": 5.3,
  "react_sigma": 0.35,
  "overshoot_prob": 0.15,
  "deadzone": 0.08,
  "ou_theta": 6.0,
  "ou_sigma": 0.05,
  "switch_penalty_s": 0.05,
  "release_ms": 110
}
```

## Armadilhas

- Delay constante em todo engajamento é a assinatura mais fácil de detectar — sortear por evento, não fixar por config.
- Compensar recoil instantaneamente no mesmo tick do tiro grita automação; a compensação humana tem latência.
- Mirar através de LOS recém-perdido sem delay gera kill impossível.
- `max_rate` alto demais reintroduz o snap que a humanização deveria remover.
- Deadzone zero faz o aim tremer contra um alvo parado.
- Ruído com `sigma` alto desloca a mira e reduz hit rate; calibrar com o FOV, não no chute.
- Overshoot sem correção fica errado para sempre; precisa de fase de retorno explícita.
- Release cortado seco no death do alvo (em vez de decair) aparece como teleporte de viewangle.
