# Aimbot — KRUNK.IO 3D (Mac)

Cheat de aimbot para o jogo em https://krunker-clone-creator.ai.studio/. Roda no seu Mac, abre o Chrome já com o aimbot ativo. Zero dependências — só Node 22+ e o Chrome instalado.

## Como usar

```bash
node start.mjs
```

Ou duplo-clique no `Aimbot.command` (Finder). O Chrome abre, o bundle do jogo é corrigido na resposta (CDP Fetch) para expor o estado interno, e o `payload.js` é injetado antes de qualquer script da página.

### Teclas em jogo

| Tecla | Ação |
|---|---|
| `G` | liga/desliga aim |
| `H` | liga/desliga auto-fire |

HUD no topo mostra `AIMBOT [G] ON · FIRE [H] ON · <nome> <dist>m <erro>°`.

### Verificação automática

```bash
node start.mjs --selftest
```

Roda em modo headless, entra na partida (`?autostart=1`), mira num bot, e confere 13 checagens (hook exposto, alvo adquirido, munição gasta). Escreve `selftest-results.json` e sai com código 0 se tudo passar.

## Como funciona

1. **`start.mjs`** abre Chrome com `--remote-debugging-port=0` e perfil descartável em temp.
2. CDP `Fetch` intercepta a resposta de `/assets/index-*.js` e injeta antes do handler de `mousemove`:
   `window.__RE_GAME__ = { get F(){...}, get Ae(){...}, get p(){...}, get We(){...}, ... }` — expõe estado que vive em closure (yaw/pitch do jogador, atores, câmera, tiro, cooldown, munição).
3. `Page.addScriptToEvaluateOnNewDocument` injeta o `payload.js` antes de qualquer script da página.
4. **`payload.js`** roda num `requestAnimationFrame` próprio: encontra a cabeça do bot mais próximo dentro de um cone de 40°, escreve `F.yaw`/`F.pitch` com suavização (lerp 0.45/frame) e, quando o erro cai abaixo de 2.5°, chama `We()` (tiro real do jogo, com cooldown/munição respeitados).

## Convenção de mira (derivada do código do jogo)

- Euler da câmera em ordem `YXZ`: `forward = (-sin(yaw)·cos(pitch), sin(pitch), -cos(yaw)·cos(pitch))`
- `yaw = atan2(-dx, -dz)`, `pitch = asin(dy / dist)` — clamp `±π/2.08` (igual ao jogo)
- Mouse sensibilidade do jogo: `0.0022 × sens × (ADS ? 0.55 : 1)` — não usada, o aimbot escreve direto no estado

## Limites

- Só funciona enquanto a sessão CDP estiver viva e a aba não for recarregada (fechar o terminal/até recarregar perde o patch; é só recolocar com `node start.mjs`).
- Sem ESP/wallhack, sem triggerbot: mira e dispara só com alvo visível dentro do cone.
- Anti-cheat de servidor não existe nesse jogo (100% client-side, zero chamadas de rede), mas use só onde as regras permitam.

## Arquivos

| Arquivo | Papel |
|---|---|
| `start.mjs` | launcher CDP: patch do bundle + injeção + selftest |
| `payload.js` | lógica de aim (rAF, cone, lerp, auto-fire) |
| `Aimbot.command` | wrapper de duplo-clique para o Finder |
| `selftest-results.json` | resultado da última verificação |
