# Referências — pack de skills de cheat

Referências externas curadas que sustentam o pack: dumps de offset, SDKs, arquitetura external, tooling de RE agêntico e o padrão Agent Skills.

| Referência | URL | Uso |
|---|---|---|
| NetVar1337/agent-skill-canon | https://github.com/NetVar1337/agent-skill-canon | Leitura complementar (game-hacking, aimbot-humanization) — NÃO copiar, licença GPL |
| NetVar1337/apex-anticheat-lab | https://github.com/NetVar1337/apex-anticheat-lab | Taxonomia de detecção em `docs/cheat-taxonomy.md` |
| a2x/cs2-dumper | https://github.com/a2x/cs2-dumper | Dump de offsets de CS2 via memflow |
| neverlosecc/source2gen | https://github.com/neverlosecc/source2gen | Geração de SDK para Source 2 |
| Source 2 SchemaExplorer | https://s2v.app/SchemaExplorer | Consulta offline de schema por build |
| Encryqed/Dumper-7 | https://github.com/Encryqed/Dumper-7 | SDK generator para UE4/UE5 |
| TKazer/CS2_External | https://github.com/TKazer/CS2_External | Referência de w2s, bone ESP e auto-update de offsets |
| Read1dno/vesta | https://github.com/Read1dno/vesta | Arquitetura external + sandbox Lua |
| KodyJKing/haloce-lua-aimbot | https://github.com/KodyJKing/haloce-lua-aimbot | API CE-Lua real e aim por ângulo |
| LaurieWired/GhidraMCP | https://github.com/LaurieWired/GhidraMCP | MCP do Ghidra para agentes |
| drvcvt/radare2-mcp | https://github.com/drvcvt/radare2-mcp | MCP para radare2/rizin |
| morluto/rea | https://github.com/morluto/rea | RE agêntico via MCP/CLI |
| memflow/memflow | https://github.com/memflow/memflow | Framework de leitura de memória |
| ufrisk/pcileech | https://github.com/ufrisk/pcileech | DMA via PCIe |
| VoltAgent/awesome-agent-skills | https://github.com/VoltAgent/awesome-agent-skills | Índice de skills de agentes |
| anthropics/skills | https://github.com/anthropics/skills | Spec e template do Agent Skills |
| agentskills.io | https://agentskills.io | Padrão aberto de Agent Skills |

## Uso no pack

- `attach-offsets` ← cs2-dumper, SchemaExplorer, Dumper-7, memflow (dump e validação de offsets por build).
- `memory-scanning` ← memflow, pcileech (leitura de memória e cenários DMA).
- `esp` e `aimbot` ← CS2_External, vesta, haloce-lua-aimbot (w2s, bone ESP, arquitetura external, aim por ângulo).
- `ai-pipeline` e `lua-ui` ← vesta, haloce-lua-aimbot, GhidraMCP/radare2-mcp/rea (sandbox Lua e tooling de RE agêntico).
- Detecção e superfície de risco ← apex-anticheat-lab (`docs/cheat-taxonomy.md`) e agent-skill-canon (leitura apenas).
- Formato das skills ← anthropics/skills, agentskills.io, awesome-agent-skills.
