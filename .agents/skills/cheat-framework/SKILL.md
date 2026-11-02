---
name: cheat-framework
description: Índice e ordem de execução do pack de skills de criação de cheats (memória, ESP, aimbot, offsets, UI Lua, pipeline LLM).
---

# Cheat Framework — índice do pack

Pack de skills para construir trainers/cheats de forma incremental, do anexo de processo até a feature final. Cada skill é autocontida e cobre uma etapa do pipeline.

## Quando usar

Use este arquivo como ponto de entrada sempre que o pedido for "criar um cheat", "montar um trainer", "adicionar ESP/aimbot", "dumpar offsets" ou "integrar IA no trainer". Ele define a ordem das etapas e roteia para a skill específica.

## Workflow

1. **Anexar ao processo** — `attach-offsets`. Abrir handle, obter base do módulo, validar permissões de leitura.
2. **Coletar offsets** — `attach-offsets`. AOB scan, pointer chains, dump de struct e entity list, gerar `offsets.json` versionado.
   - Se existir dumper da engine, `offset-toolchain` cobre o dump automático (build id → dumper → validação viva → `offsets.json`) antes do scan manual. `attach-offsets` fica para o que o dumper não entrega.
3. **Scan de memória** — `memory-scanning`. First scan / next scan, filtros, resolução de ponteiros, edição de valores.
4. **Implementar feature** — `esp` para overlay de entidades; `aimbot` para mira; `cheat-humanization` para suavização; `cheat-triggerbot-rcs` para disparo e recuo.
5. **Montar UI** — `lua-ui`. Form, controles, timers, persistência de config, teardown limpo.
   - Quando não se usa Lua (modo C++), `overlay-render` cobre o overlay externo (janela layered) ou interno (hook de Present), com DPI, multi-monitor e click-through.
6. **Pipeline de IA (opcional)** — `ai-pipeline`. Gerar código Lua em runtime via LLM e executar com `pcall`.

Regra de dependência: etapa N nunca começa antes da N-1 estar validada. Offsets errados tornam ESP e aimbot inúteis (posição fantasma).

## Referência técnica

### Mapa do pack

| Skill | Conteúdo |
|---|---|
| `attach-offsets` | OpenProcess/RPM/WPM, enum de processo, módulos, AOB, pointer chain, adb/LDPlayer |
| `memory-scanning` | First/next scan, tipos, filtros, address list, stride scan, pointerscan |
| `esp` | Entity list, posição, world-to-screen, draw box/health/skeleton, RGB |
| `aimbot` | Filtro de alvo, bone read, calcAngle, viewangles, smooth, hotkey |
| `cheat-humanization` | Reaction delay log-normal, easing/spring, ruído OU, deadzone, lead, histerese |
| `cheat-triggerbot-rcs` | Triggerbot por crosshair com delay e DPS cap; RCS por view-kick com cap deg/s |
| `game-internals` | Fingerprint por engine, entity registry, transforms/bones, tick vs frame, W2S |
| `cheat-detection-surface` | Camadas host/estático/comportamental/conta, tabela feature→sinal, checklist |
| `offset-toolchain` | Build id, cs2-dumper/Dumper-7/SchemaExplorer, validação viva, conversão p/ offsets.json |
| `re-agent-tooling` | GhidraMCP, radare2-mcp, REA, AOB sem dumper, fluxo de achar função |
| `overlay-render` | Hook de Present interno, janela layered externa, DPI, multi-monitor, click-through |
| `lua-ui` | createForm, memo/edit/button/combo/trackbar/timer, onclose, dofile |
| `ai-pipeline` | Chat form, system prompt, extração de bloco, HTTP, execução pcall |
| `fivem-external` | pipeline FiveM/GTA V: processo, entity walk, offsets de ped/vehicle, features externas |

### Roteamento por pedido

| Pedido | Skill |
|---|---|
| "anexar no jogo" / "abrir processo" | `attach-offsets` |
| "achar offset" / "dump de offsets" / "AOB" | `attach-offsets` |
| "scanner de memória" / "Cheat Engine" / "first scan" | `memory-scanning` |
| "ESP" / "box" / "overlay" / "wallhack" | `esp` |
| "aimbot" / "mira" / "aim" | `aimbot` |
| "humanizar aim" / "suavização" / "reaction time" | `cheat-humanization` |
| "triggerbot" / "RCS" / "compensação de recuo" | `cheat-triggerbot-rcs` |
| "engine" / "entity list" / "il2cpp" / "GWorld" / "schema" | `game-internals` |
| "detecção" / "VAC" / "EAC" / "ban" / "assinatura" | `cheat-detection-surface` |
| "dumper" / "cs2-dumper" / "schema dump" / "atualizar offsets" | `offset-toolchain` |
| "Ghidra" / "radare2" / "MCP de RE" / "achar função" | `re-agent-tooling` |
| "overlay" / "DirectXT" / "janela por cima" / "ImGui" | `overlay-render` |
| "menu" / "form" / "UI do trainer" / "Lua no CE" | `lua-ui` |
| "IA que gera o cheat" / "LLM no trainer" | `ai-pipeline` |
| "FiveM" / "GTA" / "mod menu FiveM" | `fivem-external` |

### Convenção de offsets

- Bloco único por jogo, namespace `off`.
- Sempre relativo à base do módulo, nunca endereço absoluto (ASLR).
- Pointer chains como arrays ordenados: `{ base, 0x10, 0x2C, 0x8 }`.
- Nomes no formato `snake_case` descrevendo o campo: `local_player`, `entity_list`, `view_matrix`, `health`.
- Loop de re-dump automático marca campos voláteis: `volatile: true`.

```json
{
  "game": "example",
  "build": "1.2.3",
  "module": "game.exe",
  "offsets": {
    "local_player": { "chain": [0x10F4A28, 0x0], "volatile": false },
    "entity_list":  { "chain": [0x10F4A30, 0x4, 0x0], "stride": 0x10 },
    "view_matrix":  { "chain": [0x10F4A40], "volatile": true },
    "health":       { "offset": 0x100 }
  }
}
```

### External read-only default

- Padrão: `OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION)` + `ReadProcessMemory`, overlay em processo separado.
- Escrita (`PROCESS_VM_WRITE`) só quando a feature exige (viewangles de aimbot, edição de valor no scanner) e é declarada explicitamente.
- Internal (DLL injetada) apenas quando a arquitetura não funciona external — registrar o motivo em uma linha.

## Exemplo

Estrutura mínima de projeto derivado deste pack:

```bash
cheat/
├─ offsets.json
├─ scanner.lua
├─ esp.lua
├─ aimbot.lua
├─ ui.lua
└─ ai.lua
```

Execução na UI principal:

```lua
-- ui.lua bootstraps every module
dofile("scanner.lua")
dofile("esp.lua")
dofile("aimbot.lua")
dofile("ai.lua")
```

## Armadilhas

- Pular a etapa de offsets "porque parece óbvio" gera ESP/aimbot sobre endereço morto.
- Endereço absoluto hardcoded quebra a cada reinício por ASLR.
- Misturar leitura e escrita sem separar handles: permissão de escrita pedida cedo demais aumenta a superfície de detecção.
- Um único `offsets.json` sem campo `build` impossibilita saber quando o dump ficou velho.
