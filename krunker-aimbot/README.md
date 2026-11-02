# KRUNK.IO — Aimbot + Mod Menu (Mac)

Cheat para o krunker.io real (não o clone do estudo). Roda num Chrome dedicado aberto por este launcher: o `payload.js` é injetado antes de qualquer script da página via CDP, captura o núcleo WASM do jogo e transforma a memória lineal do jogo em offsets que o mod menu usa.

## Rodar

```bash
node start.mjs          # abre Chrome com o aimbot ativo (modo jogador)
node start.mjs --selftest  # verificação headless automática (sai 0/1)
node verify.mjs         # bateria completa de in-match (roda junto com uma partida sua)
```

1. `node start.mjs` abre uma janela de Chrome (perfil novo em temp, não mexe no seu perfil).
2. **Você** clica Play e passa no security check do Krunker uma vez — o tool nunca auto-bypass de captcha/check (regra do ofício: CAPTCHA = passo humano).
3. Entrou na partida? Andar (W)1–2 s, pular (Espaço), levar dano — o menu no canto superior direito acende as linhas `pos`, `view`, `hp` de ○ para ● sozinho (descoberta por diff de memória + verificação de escrita).
| Com os offsets verdes, liga:

| Controle | Ação |
|---|---|
| `Ctrl+Shift+G` ou botão AIM | aimbot (cone45°, alvo mais próximo, auto-fire a2,5°) |
| `Ctrl+Shift+B` ou FLY | sobe voando (escreve +Y por frame) |
| `Ctrl+Shift+N` ou GOD | trava HP no máximo |
| HP+50 | +50 no HP máximo e liga GOD |
| TP FWD / TP UP | teletransporta40 m à frente /30 m pra cima |
| Calibragem do aim |1 mouse-look real com pointer lock → linha `aim calibrated ✓` (divergindo? o watchdog auto-inverte os sinais, `auto-corrected #N`) |

## O que a REA mostrou (arquitetura)

- Core do jogo é **WASM** (`pkg/loader-*.wasm`,433 KB): exports ofuscados `T,U,V,W…`, memória lineal `T` de ~18 MB — é lá que vivem posição, HP, câmera. Glue JS é ofuscado (obfuscator.io) — sem âncoras de string para patch de bundle.
- Por isso o approach é **runtime**: hook em `WebAssembly.instantiate(Streaming)` no `document-start` → captura da instância → **descoberta de offsets por diff de snapshot** em torno de inputs reais (W andando, Espaço pulando, dano alterando o texto do HUD) → cada offset só é aceito após **write-verify** (escreve, espera, confere persistência OU leitura de volta pelo HUD, restaura). Posição vs. matriz: escrita em matriz derive e reverta em1 frame; posição é fonte e persiste — o teste separa os dois.
- HUD como oráculo: `#bottomLeftHealth`/`#ammoVal` leem da memória — escrever `valor+7` e ver o DOM mostrar `valor+7` prova o offset de HP/munição sem adivinhação.
- Câmera: view matrix (16 float32 coluna-major no heap) → forward = `-(e2,e6,e10)`, posição da câmera = `-R·t` — extração validada por teste unitário dentro da página.

## Verificação (selftest)

```
PASS payload injected
PASS WASM memory captured — "ok 18MB wasm"
PASS view-matrix extraction math — ok1 ok2
INJECTION LAYER VERIFIED (4 checks) — match-stage SKIPPED
```

Camada de injeção: **4/4 verificados** (payload antes dos scripts, memória18 MB capturada, math da câmera certo). Etapa in-match (pos/view/hp/enemies/teleport/fly/aim): **pulada no automatizado** — o Krunker exige Play + security check humanos para entrar na partida (`verify.mjs` roda a bateria toda assim que existe uma partida; nada disso foi executado de verdade ainda = não é claim, é skip declarado).

## Limites conhecidos (não é marketing)

- **Servidor manda**: krunker.io é multiplayer server-side. Escrita de posição/HP é local — o servidor pode corrigir (rubber-band) ou flaggar. Aimbot é input local (mouse) e passa mais liso; fly/teleport/god são os mais expostos.
- **Ban**: conta real em risco se usar em partida — uma linha, decisão sua.
- Descoberta de offsets é **por sessão** (perfil temp); perfil novo = offsets novos, menu redescobre em2 s de partida.
- Sem ESP/wallhack (só mira e estado do próprio jogador).
- Se o Krunker mudar o WASM/bundle, os anchors do hook continuam (genéricos), mas confira o selftest antes de jogar.

## Arquivos

| Arquivo | Papel |
|---|---|
| `start.mjs` | launcher CDP: injeta payload, selftest da camada de injeção |
| `payload.js` | hook WASM + descoberta de offsets + mod menu + aim/fly/god/tp |
| `verify.mjs` | bateria in-match completa (pos/view/hp/enemies/teleport/fly/god/aim) |
| `selftest-results.json` | última execução do selftest |
| `live-verify.json` | última execução do verify (quando há partida) |
