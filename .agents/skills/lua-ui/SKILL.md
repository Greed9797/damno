---
name: lua-ui
description: UI de trainer em Lua no estilo Cheat Engine (createForm, memo, edit, button, combo, trackbar, timer, onclose, dofile, persistência).
---

# Lua UI (Cheat Engine style)

Construção de janela de trainer com os componentes do CE-Lua / Standoff Engine (CE 7.4). Form programático, layout responsivo, timers e teardown limpo.

## Quando usar

Quando o pedido for montar menu/tela do trainer, criar painel de configuração (API key, endpoint, model), controles de RGB, combo de bones/tipos, botão de execução, ou carregar módulos por `dofile`.

## Workflow

1. **Criar o form** com `createForm` — caption, tamanho, `position` (nunca deixar no canto).
2. **Adicionar controles** — memo para log, edit para entrada, button para ação, combo para seleção, trackbar para RGB.
3. **Ligar eventos** — `onclick`, `onTimer`, `onchange`.
4. **Layout responsivo** — `updateLayout` recalcula `left/top/width/height` a partir do tamanho do form.
5. **Persistência** — salvar/carregar config (API key, endpoint, model) em arquivo.
6. **Teardown** — `onclose` chama `getApplication().terminate()` para não deixar processo zumbi.
7. **Carregar módulos** — `dofile("esp.lua")` etc. antes de usar.

## Referência técnica

### Form base

```lua
local form = createForm()
form.Caption = "Trainer"
form.Width, form.Height = 640, 480
form.Position = poScreenCenter   -- poWorkAreaCenter também válido
form.Color = clWhite             -- ou 0xRRGGBB
```

### Componentes

- `createMemo(form)` — `ScrollBars = ssVertical`, `ReadOnly = true`, `Font`, `Color`.
- `createEdit(form)` — entrada de texto/valor.
- `createButton(form)` — `Caption`, `Cursor = crHandPoint` (valor `-21`), `OnClick = function() ... end`.
- `createComboBox(form)` — `Items` por `Add`; `ItemIndex` para seleção.
- `createTrackBar(form)` — `Min`, `Max`, `Position`.
- `createListBox(form)` — lista de endereços/resultados.
- `createTimer(form)` — `Interval` (ms), `OnTimer`, `Enabled = true`; parar com `Destroy()` no handle.

### Constantes comuns

| Constante | Valor |
|---|---|
| `poScreenCenter` | 2 |
| `poWorkAreaCenter` | 3 |
| `crHandPoint` | -21 |
| `ssVertical` | 2 |
| `clWhite` | `0xFFFFFF` |

### Layout responsivo

```lua
local function updateLayout()
  memo.Left, memo.Top = 8, 8
  memo.Width = form.Width - 24
  memo.Height = form.Height - 120
  input.Left, input.Top = 8, form.Height - 100
  input.Width = form.Width - 120
  btn.Left, btn.Top = form.Width - 96, form.Height - 101
  btn.Width, btn.Height = 80, 28
end
form.OnResize = updateLayout
```

### Teardown

```lua
form.OnClose = function()
  getApplication().terminate()
end
```

Sem isso, o processo do trainer continua vivo em background (aparece no `tasklist`), e a próxima execução falha por instância duplicada.

## Exemplo

Form completo com memo, edit, botão, timer e teardown:

```lua
-- ui.lua
local function buildUI()
  local form = createForm()
  form.Caption = "Cheat Trainer"
  form.Width, form.Height = 640, 480
  form.Position = poScreenCenter
  form.Color = clWhite

  local memo = createMemo(form)
  memo.ScrollBars = ssVertical
  memo.ReadOnly = true
  memo.Font.Name = "Consolas"
  memo.Font.Size = 9

  local input = createEdit(form)
  input.Text = "100"

  local btn = createButton(form)
  btn.Caption = "Write"
  btn.Cursor = crHandPoint
  btn.OnClick = function()
    local ok, err = pcall(function()
      local addr = getAddress("game.exe+0x10F4A28")
      writeInteger(addr, tonumber(input.Text))
      memo.Lines.Add("[+] wrote " .. input.Text)
    end)
    if not ok then memo.Lines.Add("[-] " .. tostring(err)) end
  end

  local typeCombo = createComboBox(form)
  typeCombo.Items.Add("4 Bytes")
  typeCombo.Items.Add("Float")
  typeCombo.Items.Add("2 Bytes")
  typeCombo.ItemIndex = 0

  local rBar = createTrackBar(form)
  local gBar = createTrackBar(form)
  local bBar = createTrackBar(form)
  rBar.Min, rBar.Max, rBar.Position = 0, 255, 255
  gBar.Min, gBar.Max, gBar.Position = 0, 255, 0
  bBar.Min, bBar.Max, bBar.Position = 0, 255, 0

  local function updateLayout()
    local W, H = form.Width, form.Height
    memo.Left, memo.Top = 8, 8
    memo.Width, memo.Height = W - 24, H - 200
    input.Left, input.Top = 8, H - 150
    input.Width = W - 120
    btn.Left, btn.Top = W - 96, H - 151
    btn.Width, btn.Height = 80, 28
    typeCombo.Left, typeCombo.Top = 8, H - 116
    typeCombo.Width = 160
    rBar.Left, rBar.Top, rBar.Width = 8, H - 76, W - 24
    gBar.Left, gBar.Top, gBar.Width = 8, H - 52, W - 24
    bBar.Left, bBar.Top, bBar.Width = 8, H - 28, W - 24
  end

  form.OnResize = updateLayout
  updateLayout()

  local timer = createTimer(form)
  timer.Interval = 16
  timer.OnTimer = function(t)
    -- per-frame work: ESP/aimbot tick goes here
    local col = Color.new(rBar.Position, gBar.Position, bBar.Position)
  end
  timer.Enabled = true

  form.OnClose = function()
    timer.Destroy()
    getApplication().terminate()
  end

  return form
end

buildUI()
```

Persistência de config:

```lua
local CONFIG = "config.txt"

local function saveConfig(key, endpoint, model)
  local f = io.open(CONFIG, "w")
  if not f then return end
  f:write(key .. "\n" .. endpoint .. "\n" .. model .. "\n")
  f:close()
end

local function loadConfig()
  local f = io.open(CONFIG, "r")
  if not f then return {}, "", "" end
  local key = f:read("*l") or ""
  local endpoint = f:read("*l") or ""
  local model = f:read("*l") or ""
  f:close()
  return key, endpoint, model
end
```

## Armadilhas

- Componente sem `local` vira global: colide entre módulos e não é coletável.
- `Destroy()` do timer precisa do handle; perder a referência deixa o timer vivo.
- `createForm` sem `Position` gruda no canto superior esquerdo.
- Fechar o form sem `getApplication().terminate()` deixa processo órfão — limpar com `tasklist` / `taskkill /F /IM`.
- Auto-closing brackets do VS Code quebram Lua (insere `end`/`}` no lugar errado) — desligar para `.lua`.
- `Color.new(r,g,b)` com valores fora de `0..255` satura; clampar no trackbar.
- Recriar o form em `dofile` repetido duplica janelas; guardar referência e reutilizar.
