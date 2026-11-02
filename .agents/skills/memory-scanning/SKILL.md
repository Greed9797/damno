---
name: memory-scanning
description: Fluxo de scan de memória estilo Cheat Engine (first/next scan, filtros, ponteiros, address list, stride) em Lua.
---

# Memory Scanning

Varredura de memória para localizar valores, resolver ponteiros e editar campos. Modelo mental igual ao Cheat Engine: um conjunto de resultados que encolhe a cada filtro.

## Quando usar

Quando o pedido envolver achar um valor em memória, confirmar/alterar vida, munição, dinheiro; montar address list; resolver pointer chain; ou varrer um array de structs com stride fixo.

## Workflow

1. **Anexar ao processo** (`attach-offsets.md`) e obter `base` do módulo.
2. **First scan** — varrer pelos tipos relevantes com valor conhecido.
3. **Next scan** — mudar o valor no jogo, re-filtrar com a condição (mudou / menor / maior / exato).
4. **Repetir** até restar poucos candidatos (idealmente 1–3).
5. **Estabilizar** — testar em duas execuções; se o endereço muda, é dinâmico → resolver pointer chain a partir da base.
6. **Adicionar à address list** e editar/freeze.
7. **Validar** — escrever valor, ler de volta, confirmar efeito no jogo.

## Referência técnica

### Tipos de valor

| Tipo | Bytes | Uso típico |
|---|---|---|
| `byte` | 1 | flags, estados |
| `2 byte` | 2 | contadores pequenos, nível |
| `4 byte` | 4 | vida, munição, ouro (inteiro) |
| `8 byte` | 8 | valores grandes (int64) |
| `float` | 4 | posição, matriz, velocidade |
| `double` | 8 | posição de precisão |
| `string` | n | nomes, caminhos |
| `array of bytes` | n | AOB signature |

### Algoritmos de filtro

- **exato**: `cand == value`
- **maior que**: `cand > value`
- **menor que**: `cand < value`
- **mudou**: `cand ~= prev`
- **não mudou**: `cand == prev`
- **aumentou**: `cand > prev`
- **diminuiu**: `cand < prev`
- **valor entre**: `lo <= cand <= hi`

Cada candidato guarda `(address, value)` para que o filtro "mudou" funcione na próxima passada.

### Estático vs ponteiro

- **Estático**: `base + offset` constante. Ex.: `getAddress("game.exe+0x10F4A28")`.
- **Ponteiro**: `[[base + o1] + o2] + o3`. Ler o valor no endereço para obter o próximo ponteiro, somar o offset, repetir.

Pointer chain em Lua:

```lua
local function readPointer(base, offsets)
  local addr = base
  for i = 1, #offsets do
    local value = readPointer(addr)
    if value == 0 then return nil end
    addr = value + offsets[i]
  end
  return addr
end

local lp = readPointer(getAddress("game.exe"), { 0x10F4A28, 0x0 })
if lp then
  local hp = readInteger(lp + 0x100)
end
```

### Address list

- Estrutura: `{ description, address, type, value }`.
- Freeze por timer reescrevendo o valor.
- Edição em massa: aplicar o mesmo `write` a uma lista filtrada.

### Scan em array com stride

Entity list é um array de ponteiros (ou structs inline) com passo fixo:

```lua
-- entity list starts at base address; each entry is a pointer in an array
local list = readPointer(entityListAddr)
local stride = 0x8 -- pointer size for 64-bit arrays
for i = 0, maxEntities - 1 do
  local ent = readPointer(list + i * stride)
  if ent ~= 0 then
    local hp = readInteger(ent + 0x100)
  end
end
```

Para structs inline, o stride é o tamanho da struct (ex.: `0x1A0`); o endereço de cada campo é `list + i * stride + fieldOffset`.

## Exemplo

```lua
-- first + next scan against the attached Cheat Engine process
local candidates = {}   -- { {addr=, value=}, ... }

local function firstScan(value, vtype)
  candidates = {}
  local list = getAddressList()
  local startAddr = getAddress("game.exe")
  local mr = createMemoryRecord()
  mr.Description = "scan_probe"
  mr.Address = string.format("%X", startAddr)
  -- Use Cheat Engine's built-in scanner for large ranges
  local scan = createFoundList(getMainForm())
  scan.initialize("4 Bytes")
  scan.firstScan(soExactValue, vtDword, rtRounded, tostring(value),
                 "", startAddr, startAddr + 0x20000000, "*", fsmNotAligned, "", false)
  for i = 0, scan.Count - 1 do
    candidates[#candidates + 1] = { addr = tonumber(scan[i]) }
  end
  scan.destroy()
end

local function nextScanExact(value)
  local scan = createFoundList(getMainForm())
  scan.initialize("4 Bytes")
  scan.firstScan(soExactValue, vtDword, rtRounded, tostring(value),
                 "", 0, 0x7FFFFFFFFFFFFFFF, "*", fsmNotAligned, "", false)
  local kept = {}
  for _, c in ipairs(candidates) do
    for i = 0, scan.Count - 1 do
      if tonumber(scan[i]) == c.addr then
        kept[#kept + 1] = c
        break
      end
    end
  end
  scan.destroy()
  candidates = kept
  return #candidates
end

local function resetScan()
  candidates = {}
end

firstScan(100, "4 Bytes")
-- change the value in-game to 87, then:
nextScanExact(87)
print("candidates left: " .. #candidates)
```

Alternativa nativa (sem `createFoundList`) para ranges pequenos, lendo com `readInteger` e comparando — mais lenta, porém previsível:

```lua
local function bruteScan(startAddr, size, value)
  local hits = {}
  for a = startAddr, startAddr + size - 4, 4 do
    if readInteger(a) == value then
      hits[#hits + 1] = a
    end
  end
  return hits
end
```

## Armadilhas

- Valor que muda por frame (timer, posição, animação) invalida o filtro "exato" — use "mudou/não mudou" ou congela a tela.
- Endereço em memória não é estável entre execuções; nunca hardcode absoluto, sempre `base + offset`.
- Float quase nunca é exato: use faixa (`soBiggerThan`/`soSmallerThan`) ou tolerância (`valor ± 0.01`).
- Varredura sem limite de range estoura tempo e pode ler página inválida — sempre `try/except` guarda `readInteger`.
- 32-bit vs 64-bit: stride de ponteiro é 4 vs 8 bytes; errar duplica ou pula entidades.
- ASLR: reinício do processo desloca a base; recalcular base ao anexar.
