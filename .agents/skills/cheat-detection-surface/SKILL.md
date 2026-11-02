---
name: cheat-detection-surface
description: Taxonomia de detecção por camada (host, estático, comportamental, conta) e tabela feature→sinal para checar o próprio build antes do release.
---

# Cheat Detection Surface

Onde cada feature de um cheat expõe o processo: qual camada enxerga o quê, qual sinal estatístico o servidor coleta e o que o próprio build deixa como rastro.

## Quando usar

Quando o pedido for "isso é detectável", "por que levou ban", "como o VAC/EAC pega", "revisar sinais de detecção", "checar o build antes de soltar", "HWID spoof é consistente" ou "assinatura de processo".

## Workflow

1. **Inventariar features** — lista do que o build faz: leitura, escrita, injeção, overlay, input.
2. **Classificar por camada** — host, estático, comportamental, conta.
3. **Marcar cada feature na tabela** — onde ela aparece e qual sinal emite.
4. **Revisar sinais por feature** — delay, snap, lock, compensação, DPS, handles.
5. **Rodar o checklist pré-release** — 8–10 itens objetivos.
6. **Corrigir antes de distribuir** — feature barulhenta se ajusta ou sai.

## Referência técnica

### Camadas

| Camada | O que vê | Exemplos de coleta |
|---|---|---|
| Host | Processos, handles, módulos, threads, drivers | Enum de handle, ETW, integridade de assinatura |
| Estático | Bytes do binário, PDB, strings ricas | Hash, YARA, seções atípicas |
| Comportamental | Padrão de input e telemetria do jogo | Distribuição de delay, snap, K/D, hit ratio |
| Conta | Atributos persistentes | HWID, IP/região, curva de skill, impossible travel |

### Feature → detecção

| Feature | Comportamental | Host | Estático |
|---|---|---|---|
| Aimbot via memória | ● snap/ângulo impossível | ◐ handle de leitura cedo | ○ raro |
| ESP / radar | ● vê entidade não replicada | ○ raro | ○ raro |
| Triggerbot | ● distribuição de delay | ◐ input sintético | ○ |
| RCS | ● compensação sem curva | ◐ escrita de viewangle | ○ |
| DMA | ● padrão de leitura remoto | ● enum de PCIe por vendor-ID | ○ |
| HWID spoof | ○ | ○ | ● inconsistência SMBIOS/disk/MAC |
| Injeção de DLL | ○ | ● thread start address, módulo sem assinatura | ◐ PDB e strings |
| Overlay externo | ○ | ◐ janela layered sobre o jogo | ○ |

Legenda: ● primário, ◐ secundário, ○ raro.

### Sinais por feature

- **Snap tick-aligned**: correção que cai exatamente no tick do servidor.
- **Lock perfeito**: ângulo idêntico ao alvo por muitos ticks consecutivos.
- **Compensação instantânea de RCS**: divergência zero entre tiro e correção.
- **Aim sem reação**: tempo entre estímulo e correção abaixo do humano.
- **Handle com `PROCESS_VM_WRITE`** pedido no início do processo.
- **Overlay em fullscreen exclusive**: janela layered sobre jogo exclusive é atípica.
- **Processo zumbi**: overlay permanece após o jogo fechar.
- **DPS no cap**: cadência exatamente na taxa da arma, sem variação.
- **Reaction delay constante**: distribuição degenerada.
- **Troca de alvo sem custo**: retarget instantâneo entre inimigos.

### Tabela de consistência de HWID

| Campo | Fonte | Checar com |
|---|---|---|
| SMBIOS UUID | Firmware | BIOS date, fabricante, serial |
| Disk serial | SMART / NVMe | Modelo e firmware |
| MAC | NIC | Vendor OUI compatível |
| CPU ID | CPUID | Modelo e stepping |
| Machine GUID | Registro | Data de instalação |

Inconsistência nested (ex.: SMBIOS de um fabricante com data impossível) é o sinal mais forte que spoof de campo único deixa.

### Checklist pré-release

```text
[ ] Todo write declarado e justificado (nenhum WPM escondido)
[ ] Delay de reação presente e variável no aim/trigger
[ ] Sem lock por mais de N ticks consecutivos no mesmo alvo
[ ] Cooldown respeita a taxa de tiro da arma
[ ] RCS com cap de deg/s, nunca correção total instantânea
[ ] Overlay não bloqueia game thread e não aparece em exclusive
[ ] Handles e timers fechados no teardown (sem processo zumbi)
[ ] Nenhum módulo injetado sem assinatura e sem thread start estranha
[ ] Nenhum campo de HWID alterado de forma inconsistente
[ ] Logs internos não expõem nomes de features em arquivo persistente
```

## Exemplo

```text
FEATURE              HOST              BEHAVIORAL          ESTÁTICO
-----------------------------------------------------------------------
aimbot (RPM)         handle read       snap / lock         -
aimbot (WPM)         handle write      compensação         -
triggerbot           input sintético   delay degenerado    -
ESP                  -                 entidade não repl.  -
overlay externo      janela layered    -                   -
injeção              módulo/thread     -                   PDB, strings
DMA                  enum PCIe         leitura remota      -
HWID spoof           -                 -                   inconsistência
```

## Armadilhas

- Detecção comportamental não precisa conhecer o binário; código limpo não protege de sinal estatístico.
- Pular o checklist comportamental porque "o código não faz nada de errado" ignora a camada que mais pega.
- Handle de leitura pedido cedo no boot é tão visível quanto escrita.
- Overlay que sobrevive ao jogo parece ferramenta de automação rodando de fundo.
- Spoof de um único campo de HWID costuma bater de frente com outro campo não alterado.
- Medir detecção só por "rodou sem banir em uma conta" não cobre correlação entre contas.
- Assinatura estática de strings de feature é trivial de trocar; comportamento não é.
- Deixar log em disco com nome de feature entrega o build inteiro.
