---
name: aimbot
description: Pipeline de aimbot (filtro de alvo, FOV, calcAngle, viewangles ou mouse, suavização, hotkey) com exemplo Lua.
---

# Aimbot

Mira automática: seleciona alvo dentro do FOV, calcula o ângulo até o bone escolhido e aplica esse ângulo nas viewangles ou no mouse.

## Quando usar

Quando o pedido for calcular e aplicar mira, ajustar FOV, suavizar movimento, escolher bone (cabeça/pescoço/peito/pés) ou mapear cálculo de ângulo para movimento de mouse.

## Workflow

1. **Loop de entidades** — mesma entity list do ESP.
2. **Filtro** — `alive`, `team ~= localTeam`, distância máxima, dentro do FOV.
3. **Ler bone** — `player + boneOffset` (offset do bone na array de bones).
4. **Calcular ângulo** — delta até o alvo, `pitch`/`yaw` em graus.
5. **Aplicar** — escrever viewangles com clamp (`-89..89` no pitch, yaw normalizado) ou converter para movimento de mouse.
6. **Suavizar** — interpolar entre ângulo atual e alvo.
7. **Hotkey** — hold/toggle para ativar.
8. **Seleção de bone** — combo box com os offsets conhecidos.

## Referência técnica

### Cálculo de ângulo

```text
delta = targetPos - eyePos
hyp   = sqrt(dx*dx + dy*dy)
pitch = -atan2(dz, hyp) * 180/pi
yaw   =  atan2(dy, dx)  * 180/pi
```

- `pitch` em graus, clampado em `[-89, 89]`.
- `yaw` normalizado em `[-180, 180]`: `yaw = ((yaw + 180) % 360) - 180`.

### Aplicação via viewangles

- Endereço das viewangles lido como vetor `float[3]`; escrever `pitch, yaw, roll(0)`.
- Requer handle com `PROCESS_VM_WRITE` e `PROCESS_VM_OPERATION`.

### Aplicação via mouse

- Calcular delta de ângulo, normalizar, multiplicar pela sensibilidade e mover.
- `mouse_event`/`SendInput` (Windows) ou `SetCursorPos` + offset relativo.

### Bones (exemplo do transcript, engine Source-like)

- Cabeça: `+0x40 + 0x52` (bone index → offset de matriz de bones).
- Pescoço, peito, pés: offsets distintos na array de bones; cada bone é um `vec3` (3 floats) com stride 12/16 conforme engine.

### Suavização

- `smooth` é o divisor do delta: `pitch += (targetPitch - pitch) / smooth`.
- Smooth maior = movimento mais lento/suave; `1` = snap.

## Exemplo

```lua
-- aimbot.lua
local aim = {}

aim.enabled = false
aim.fov = 15           -- degrees
aim.smooth = 8
aim.bone = 0x40 + 0x52  -- head
aim.maxDist = 500

local function calcAngle(src, dst)
  local dx, dy, dz = dst.x - src.x, dst.y - src.y, dst.z - src.z
  local hyp = math.sqrt(dx*dx + dy*dy)
  local pitch = -math.atan2(dz, hyp) * (180 / math.pi)
  local yaw = math.atan2(dy, dx) * (180 / math.pi)
  return pitch, yaw
end

local function normYaw(yaw)
  return ((yaw + 180) % 360) - 180
end

local function clampPitch(p)
  if p > 89 then return 89 end
  if p < -89 then return -89 end
  return p
end

local function getBonePos(ent, boneOffset)
  local boneMatrix = readPointer(ent + 0x26A8) -- bone matrix pointer
  if not boneMatrix then return nil end
  return {
    x = readFloat(boneMatrix + boneOffset),
    y = readFloat(boneMatrix + boneOffset + 4),
    z = readFloat(boneMatrix + boneOffset + 8),
  }
end

local function angleDistance(cur, target)
  local d = math.abs(normYaw(target - cur))
  return d
end

function aim.tick(eyePos, curPitch, curYaw)
  if not aim.enabled then return curPitch, curYaw end

  local base = getAddress("game.exe")
  local lp = readPointer(base + 0x10F4A28)
  if not lp then return curPitch, curYaw end
  local localTeam = readInteger(lp + 0x0F4)
  local list = readPointer(readPointer(base + 0x10F4A30) + 0x4)
  if not list then return curPitch, curYaw end

  local best = nil
  local bestDelta = aim.fov

  for i = 0, 63 do
    local ent = readPointer(list + i * 0x10)
    if ent ~= 0 and ent ~= lp then
      local team = readInteger(ent + 0x0F4)
      local hp = readInteger(ent + 0x100)
      if team ~= localTeam and hp > 0 then
        local pos = getBonePos(ent, aim.bone)
        if pos then
          local pitch, yaw = calcAngle(eyePos, pos)
          local d = angleDistance(curYaw, yaw)
          if d < bestDelta then
            bestDelta = d
            best = { pitch = pitch, yaw = yaw }
          end
        end
      end
    end
  end

  if not best then return curPitch, curYaw end

  local tp = clampPitch(best.pitch)
  local ty = normYaw(best.yaw)
  local np = curPitch + (tp - curPitch) / aim.smooth
  local ny = curYaw   + (normYaw(ty - curYaw)) / aim.smooth
  return clampPitch(np), normYaw(ny)
end
```

Uso no loop (escrita de viewangles):

```lua
local angles = getAddress("game.exe") + 0x10F4A40
onTimer(function()
  local curPitch = readFloat(angles)
  local curYaw   = readFloat(angles + 4)
  local eye = { x = readFloat(angles + 0x100), y = readFloat(angles + 0x104), z = readFloat(angles + 0x108) }
  local p, y = aim.tick(eye, curPitch, curYaw)
  writeFloat(angles, p)
  writeFloat(angles + 4, y)
end)
```

Hotkey hold com timer separado:

```lua
local hk = createHotkey(function()
  aim.enabled = not aim.enabled
end)
hk.keys = VK_XBUTTON2
```

## Armadilhas

- Aritmética em graus vs radianos: `atan2` retorna radiano; converter antes de escrever viewangles.
- Esquecer o clamp de pitch causa "flip" vertical quando o alvo está acima/abaixo.
- Ângulo sem normalização `[-180,180]` faz a mira girar pela volta errada.
- Sem retarget após kill, o aimbot fica preso no cadáver — recomputar o melhor alvo a cada tick.
- FOV medido só em yaw ignora pitch: use distância angular real (`angDist ≈ hypot(dPitch, dYaw)`).
- Sem line-of-sight, o aimbot atravessa parede (wallbang) e mira alvo atrás de geometria.
- `smooth` igual a zero divide por zero; mínimo `1`.

