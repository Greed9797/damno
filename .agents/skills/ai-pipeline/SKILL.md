---
name: ai-pipeline
description: Integração de LLM dentro do trainer Lua (chat form → endpoint OpenAI-compatible → extração de bloco → execução via load/pcall).
---

# AI Pipeline (LLM no trainer)

Chat dentro do trainer que transforma pedido em linguagem natural em código Lua executável no contexto do próprio CE. O valor está no contrato de saída: o modelo precisa devolver só código, e o runner precisa extrair e executar com segurança.

## Quando usar

Quando o pedido for "IA que gera o cheat", "chat no trainer", "conectar LLM", gerar código Lua em runtime, ou configurar API key/endpoint/model dentro da UI.

## Workflow

1. **Form de chat** — memo de saída + edit de entrada + botão enviar (`lua-ui.md`).
2. **Montar messages JSON** — `system` com papel/APIs fixas; `user` com o pedido.
3. **POST** em `/v1/chat/completions` (OpenAI-compatible) via `io.popen`+curl ou luasocket.
4. **Extrair bloco** — regex de ```` ```lua ... ``` ````; fallback: primeira ocorrência de `local function`.
5. **Executar** — `load(code)` + `pcall`; erro vai para o memo, sem derrubar o trainer.
6. **Config** — form com API key, endpoint e model; salvar em arquivo.
7. **Rate limit** — tratar HTTP 429 com backoff e mensagem no memo.

## Referência técnica

### Arquitetura

```text
[memo chat] ← [input edit] → buildMessages()
        ↓
   httpPost(endpoint, apiKey, json)
        ↓
   extractLuaBlock(response)
        ↓
   load(code) → pcall(fn) → memo
```

### System prompt (contrato de saída)

```text
You are a Lua code generator for a Cheat Engine trainer.
Return ONLY a fenced lua code block. No prose, no explanation.
Available globals:
  getAddress, readInteger/readFloat/readBytes, writeInteger/writeFloat,
  getAddressList, createForm, createMemo, createEdit, createButton,
  createComboBox, createTrackBar, createTimer, Color, getMainForm
Rules:
  - Wrap entry logic in a single local function.
  - Use pcall for any risky read/write.
  - Never assume a fixed base address; always getAddress("game.exe+...").
```

### Extração de bloco

```lua
local function extractLuaBlock(text)
  -- standard fenced block
  local code = text:match("```lua%s*(.-)```")
  if code then return code end
  code = text:match("```%s*(.-)```")
  if code then return code end
  -- no fence: cut from first local function to end
  local start = text:find("local%s+function")
  if start then return text:sub(start) end
  return nil
end
```

### Execução segura

```lua
local fn, err = load(code)
if not fn then
  memo.Lines.Add("[-] syntax: " .. tostring(err))
  return
end
local ok, res = pcall(fn)
if not ok then memo.Lines.Add("[-] runtime: " .. tostring(res)) end
```

### Transporte HTTP em Lua

`io.popen` + curl, arquivo temporário, VBS para esconder console:

```lua
local function httpPost(endpoint, key, body)
  local tmpReq = os.getenv("TEMP") .. "\\req.json"
  local tmpRes = os.getenv("TEMP") .. "\\res.json"

  local f = io.open(tmpReq, "w")
  f:write(body)
  f:close()

  local cmd = string.format(
    'curl -s -X POST "%s" -H "Content-Type: application/json" ' ..
    '-H "Authorization: Bearer %s" --data-binary "@%s" -o "%s"',
    endpoint, key, tmpReq, tmpRes)

  -- run hidden through the shell
  os.execute(cmd)

  local r = io.open(tmpRes, "r")
  if not r then return nil, "no response file" end
  local data = r:read("*a")
  r:close()
  return data
end
```

`luasocket` (quando disponível) evita arquivo temporário:

```lua
local http = require("socket.http")
local ltn12 = require("ltn12")
local resp = {}
local _, code = http.request{
  url = endpoint,
  method = "POST",
  headers = {
    ["Content-Type"] = "application/json",
    ["Authorization"] = "Bearer " .. key,
    ["Content-Length"] = tostring(#body),
  },
  source = ltn12.source.string(body),
  sink = ltn12.sink.table(resp),
}
local data = table.concat(resp)
```

### JSON manual (sem lib)

Para o payload pequeno, montar com escape de aspas/quebras:

```lua
local function jsonEscape(s)
  s = s:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n")
  return s
end

local function buildBody(system, user, model)
  return string.format(
    '{"model":"%s","messages":[{"role":"system","content":"%s"},' ..
    '{"role":"user","content":"%s"}]}',
    jsonEscape(model), jsonEscape(system), jsonEscape(user))
end
```

## Exemplo

```lua
-- ai.lua
local AI = {}

AI.endpoint = "https://api.example.com/v1/chat/completions"
AI.model = "gpt-4o-mini"
AI.key = ""
local SYSTEM = [[You are a Lua code generator for a Cheat Engine trainer.
Return ONLY a fenced lua code block. No prose.
APIs: getAddress, readInteger, readFloat, writeInteger, writeFloat,
getAddressList, createForm, createMemo, createEdit, createButton,
createComboBox, createTrackBar, createTimer, Color, getMainForm.]]

local function extractLuaBlock(text)
  local code = text:match("```lua%s*(.-)```") or text:match("```%s*(.-)```")
  if code then return code end
  local start = text:find("local%s+function")
  if start then return text:sub(start) end
  return nil
end

local function parseContent(json)
  -- naive: grab the first "content":"..." value
  local content = json:match('"content"%s*:%s*"((.-)[^\\])"')
  if not content then return nil end
  content = content:gsub("\\n", "\n"):gsub('\\"', '"'):gsub("\\\\", "\\")
  return content
end

function AI.ask(prompt, memo)
  if AI.key == "" then
    memo.Lines.Add("[-] missing API key")
    return
  end

  local body = string.format(
    '{"model":"%s","messages":[{"role":"system","content":"%s"},' ..
    '{"role":"user","content":"%s"}]}',
    AI.model,
    SYSTEM:gsub("\n", "\\n"):gsub('"', '\\"'),
    prompt:gsub("\n", "\\n"):gsub('"', '\\"'))

  local req = os.getenv("TEMP") .. "\\ai_req.json"
  local res = os.getenv("TEMP") .. "\\ai_res.json"
  local f = assert(io.open(req, "w"))
  f:write(body); f:close()

  local cmd = string.format(
    'curl -s -X POST "%s" -H "Content-Type: application/json" ' ..
    '-H "Authorization: Bearer %s" --data-binary "@%s" -o "%s"',
    AI.endpoint, AI.key, req, res)
  os.execute(cmd)

  local r = io.open(res, "r")
  if not r then memo.Lines.Add("[-] no response"); return end
  local raw = r:read("*a"); r:close()

  if raw:find("429") then
    memo.Lines.Add("[-] rate limited; retry later")
    return
  end

  local content = parseContent(raw)
  if not content then memo.Lines.Add("[-] no content in response"); return end

  local code = extractLuaBlock(content)
  if not code then memo.Lines.Add("[-] no lua block"); return end

  memo.Lines.Add("[*] generated code:")
  memo.Lines.Add(code)

  local fn, err = load(code)
  if not fn then memo.Lines.Add("[-] syntax: " .. tostring(err)); return end
  local ok, runErr = pcall(fn)
  if not ok then memo.Lines.Add("[-] runtime: " .. tostring(runErr)) end
end

return AI
```

Form de configuração:

```lua
local form = createForm()
form.Caption = "AI Config"
form.Width, form.Height = 480, 220
form.Position = poScreenCenter

local keyEdit = createEdit(form); keyEdit.Text = AI.key
local epEdit  = createEdit(form); epEdit.Text  = AI.endpoint
local mdEdit  = createEdit(form); mdEdit.Text  = AI.model

local saveBtn = createButton(form)
saveBtn.Caption = "Save"
saveBtn.OnClick = function()
  AI.key, AI.endpoint, AI.model = keyEdit.Text, epEdit.Text, mdEdit.Text
  local f = io.open("ai_config.txt", "w")
  f:write(AI.key .. "\n" .. AI.endpoint .. "\n" .. AI.model .. "\n")
  f:close()
end
```

## Armadilhas

- Resposta com prosa antes do código quebra `load()`; o system prompt precisa fixar "only fenced block" e o extrator não pode confiar no primeiro `local`.
- Streaming não funciona com `pcall` síncrono: sem SSE, sem `stream: true`.
- API key em arquivo texto é aceitável para ferramenta local; não logar a key no memo.
- Prompt sem formato de saída fixo devolve tutorial/prosa em vez de código.
- `os.execute` bloqueia a UI: rodar o request fora do `OnTimer` principal ou aceitar travada curta.
- `%TEMP%` pode não existir/variar; fallback para diretório atual.
- JSON montado à mão quebra com aspas/quebras não escapadas no prompt.
