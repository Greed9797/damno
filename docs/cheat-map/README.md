# Cheat Map — base de código construído

Índice dos 11 repositórios GitHub de cheat/dev analisados, grafo de relacionamento verificado no código, padrões extraídos e mapa de arquitetura por categoria. Base de reuso para os packs de skills em `.agents/skills/` (offset-toolchain, overlay-render, attach-offsets, aimbot, esp, cheat-triggerbot-rcs).

## Grafo de relacionamento

```mermaid
graph TB
    subgraph FiveM_Externals["FiveM Externals"]
        DEVICE["Device9999/FiveM-External-ESP"]
        HUGU["huguluhu/fivem-external"]
        CAST["castellri/FiveM-External-Cheat"]
        HARR["harrenscore/FiveM-External-Cheat"]
    end

    subgraph Loaders["Loaders"]
        XIR["lateidev/XirLoader"]
    end

    subgraph Kernel_Bypass["Kernel/Bypass"]
        NKGA["nkga/cheat-driver"]
        CLEAN["DErDYAST1R/64KernelDriverCleaner"]
        HYPER["MicrosoftARMAssembler/Hyperspace"]
    end

    subgraph Dumpers_Executors["Dumpers/Executors"]
        KHAN["khannedj/FiveM-Mod-Menu"]
        ASSH["asshetys9/FIVEM-Cheat-with-Lua-Executor-and-dumper"]
    end

    CAST ---|mesmo código (diff -rq vazio)| HARR
    KHAN ---|mesmo código (md5 idêntico)| ASSH
    CAST ---|mesma feature: hook Present + ImGui DX11| KHAN
    HUGU ---|mesma feature: ESP box+skeleton via w2s| DEVICE
    NKGA ---|mesma feature: R/W kernel via IOCTL| HYPER
    CLEAN ---|complementa: limpa rastros de driver (PiDDB/HashBucket/MMU)| HYPER
    XIR ---|complementa: loader/injector externo p/ FiveM| HUGU

    style FiveM_Externals fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style Loaders fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style Kernel_Bypass fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style Dumpers_Executors fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style DEVICE fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style HUGU fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style CAST fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style HARR fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style XIR fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style NKGA fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style CLEAN fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style HYPER fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style KHAN fill:#1a1a2e,stroke:#8B0000,color:#ffffff
    style ASSH fill:#1a1a2e,stroke:#8B0000,color:#ffffff
```

Relações só existem onde código ou README confirmou. `wezy04-cloud/-RELEASE-Cobalt-Open-Source-Loader` não entrou no grafo (repositório não existe — ver `repos.md`).

## Tabela resumo

| Repo | ★ | Linguagem | Tipo | Status |
|---|---|---|---|---|
| castellri/FiveM-External-Cheat | 1 | C++ | FiveM external (fontes ausentes) | analisado |
| khannedj/FiveM-Mod-Menu | 1 | C++ | internal DLL + menu ImGui | analisado |
| harrenscore/FiveM-External-Cheat | 1 | C++ | FiveM external (fontes ausentes) | analisado |
| asshetys9/FIVEM-Cheat-with-Lua-Executor-and-dumper | 1 | C++ | internal DLL (fork do Mod-Menu) | analisado |
| wezy04-cloud/-RELEASE-Cobalt-Open-Source-Loader | — | — | loader ImGui C++ | NÃO ENCONTRADO |
| Device9999/FiveM-External-ESP | 44 | C++ | external ESP/aimbot | analisado |
| huguluhu/fivem-external | 0 | C++ | external completo c/ Lua | analisado |
| nkga/cheat-driver | 320 | C | driver kernel R/W | analisado |
| DErDYAST1R/64KernelDriverCleaner | 229 | C++ | driver kernel cleaner | analisado |
| MicrosoftARMAssembler/Hyperspace | 100 | C++ | manual map + EAC bypass | analisado |
| lateidev/XirLoader | 2 | Python | loader streamproof FiveM | analisado |

Nota: ★ = `gh repo view` na data da análise (missão citava 208 p/ cleaner e 98 p/ Hyperspace; valores reais 229 e 100).

## Como usar este map

- **`repos.md`** — ficha por repo: stars, license, features confirmadas no código, arquivos-chave, o que é aproveitável como base.
- **`patterns.md`** — 16 padrões transversais com evidência `arquivo:linha` e ligação com skill do pack.
- **`architecture.md`** — 4 diagramas mermaid (external típico, FiveM external, loader streamproof, driver kernel) + decisões de design para o pack.

Integração com skills existentes em `.agents/skills/`:
- offsets/patterns → `offset-toolchain`, `attach-offsets`, `memory-scanning`
- overlay/janela → `overlay-render`
- aimbot/triggerbot → `aimbot`, `cheat-triggerbot-rcs`
- ESP/w2s → `esp`
- anti-snap/humanização → `cheat-humanization`
- Lua → `lua-ui`, `ai-pipeline`, projeto `executor/`
