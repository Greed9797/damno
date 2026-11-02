---
name: esp
description: Pipeline de ESP (entity list → posição → world-to-screen → desenho de box/health/skeleton com cor em tempo real).
---

# ESP (Extra Sensory Perception)

Overlay que desenha informações de entidades na tela. O resultado depende inteiramente de três coisas: lista de entidades correta, matriz de câmera correta e conversão de mundo para tela correta.

## Quando usar

Quando o pedido for desenhar caixas, health bars, nomes, distância, esqueleto ou wallhack/xray sobre jogadores/entidades, geralmente em Lua com Cheat Engine ou em um overlay external de processo separado.

## Workflow

1. **Obter a entity list** — endereço base do array + stride + contagem máxima plausível.
2. **Ler a posição** de cada entidade (`vec3 X,Y,Z`) e a saúde (atual/máxima).
3. **Ler a view/projection matrix** (`dwViewMatrix` em engines Source) uma vez por frame.
4. **World-to-screen**: multiplicar posição pela matriz, dividir por `w`, aplicar flip de Y e clamp na borda.
5. **Desenhar**: box, health bar, nome, distância, skeleton (opcional).
6. **Colorir em tempo real** com `Color.new(r,g,b)` alimentado por trackbars.
7. **Loop `onPaint`** — recalcular tudo a cada frame; nada de cache velho.

## Referência técnica

### World-to-screen (matriz 4x4, row-major, Source-like)

Com matriz `m` indexada 1..16 (Lua) e `w = m13..m16 · pos`:

```text
sx = (m1*x + m2*y + m3*z + m4)
sy = (m5*x + m6*y + m7*z + m8)
w  = (m13*x + m14*y + m15*z + m16)
invW = 1 / w
screenX = (width/2)  + (sx * invW) * (width/2)
screenY = (height/2) - (sy * invW) * (height/2)   -- Y flipped
```

Condições de validade: `w > 0.001` (atrás da câmera é descartado) e `screenX/screenY` dentro de `[0,width] × [0,height]` (ou clamp para desenhar na borda).

### Ordem de leitura

- Matriz: `readFloat` ×16 ou `readBytes` de 64 bytes decodificado em floats.
- Posição: `readFloat(base + posOffset)`, `.y`, `.z` consecutivos (stride 4).
- Health: `readInteger` (atual) e `readInteger` (máx), offsets separados.

### Desenho

- Box: retângulo em `[screenX - w/2, screenY - h]` com `w/h` derivados da distância.
- Health bar: retângulo vertical ao lado da box, proporção `hp/hpMax`.
- Skeleton: bones do array de bones do player; ler cada `bonePos` e projetar individualmente.
- Xray: duas passadas — desenhar ignorando z, depois aplicar alpha por profundidade.

## Exemplo

```lua
-- esp.lua -- expanded from the base module
local esp = {}

local W, H = 1920, 1080

esp.matrix = {}

function esp.readMatrix(addr)
  for i = 1, 16 do
    esp.matrix[i] = readFloat(addr + (i - 1) * 4)
  end
end

function esp.worldToScreen(pos)
  local m = esp.matrix
  local sx = m[1]*pos.x + m[2]*pos.y + m[3]*pos.z + m[4]
  local sy = m[5]*pos.x + m[6]*pos.y + m[7]*pos.z + m[8]
  local w  = m[13]*pos.x + m[14]*pos.y + m[15]*pos.z + m[16]
  if w < 0.001 then return nil end
  local inv = 1 / w
  local x = (W / 2) + (sx * inv) * (W / 2)
  local y = (H / 2) - (sy * inv) * (H / 2)
  if x < 0 or x > W or y < 0 or y > H then return nil end
  return x, y
end

function esp.drawBox(x, y, w, h, color)
  local c = Canvas or getCanvas
  drawRectFilled(x - w/2, y - h, w, h, color, 0)
  -- outline
  drawRect(x - w/2, y - h, w, h, color, 0, 1)
end

function esp.healthBar(x, y, h, hp, hpMax, color)
  local frac = hp / hpMax
  local barH = h * frac
  drawRectFilled(x - 3, y - barH, 2, barH, color, 0)
end

function esp.onPaint()
  local lp = readPointer(getAddress("game.exe") + 0x10F4A28)
  if not lp then return end
  local localTeam = readInteger(lp + 0x0F4)
  local entityList = readPointer(readPointer(getAddress("game.exe") + 0x10F4A30) + 0x4)
  if not entityList then return end

  for i = 0, 63 do
    local ent = readPointer(entityList + i * 0x10)
    if ent ~= 0 and ent ~= lp then
      local team = readInteger(ent + 0x0F4)
      local hp = readInteger(ent + 0x100)
      if team ~= localTeam and hp > 0 then
        local pos = {
          x = readFloat(ent + 0x134),
          y = readFloat(ent + 0x138),
          z = readFloat(ent + 0x13C),
        }
        local sx, sy = esp.worldToScreen(pos)
        if sx then
          local h = 600 / (pos.x + pos.y)
          local w = h / 2
          esp.drawBox(sx, sy, w, h, Color.new(255, 0, 0))
          esp.healthBar(sx - w/2 - 6, sy, h, hp, 100, Color.new(0, 255, 0))
        end
      end
    end
  end
end
```

Cor em tempo real a partir de três trackbars:

```lua
local rBar = createTrackBar(getMainForm())
local gBar = createTrackBar(getMainForm())
local bBar = createTrackBar(getMainForm())
rBar.Min, rBar.Max, rBar.Position = 0, 255, 255
gBar.Min, gBar.Max, gBar.Position = 0, 255, 0
bBar.Min, bBar.Max, bBar.Position = 0, 255, 0

local function currentColor()
  return Color.new(rBar.Position, gBar.Position, bBar.Position)
end
```

## Armadilhas

- Ler a matriz uma vez fora do frame deixa ESP desalinhado em movimento — releia todo frame.
- Stride errado (4 vs 8, struct inline vs array de ponteiros) gera ESP em posição fantasma.
- Não filtrar `team == localTeam` desenha caixas no próprio time.
- Players mortos/dormientes mantêm entidade válida mas posição lida do lixo — checar `hp > 0` e flag de dormência.
- `w <= 0` (atrás da câmera) não pode ser desenhado; sem o guard a box aparece invertida.
- `readFloat` em endereço inválido retorna `0` silenciosamente — validar ponteiro antes.
