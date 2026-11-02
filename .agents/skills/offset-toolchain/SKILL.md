---
name: offset-toolchain
description: Pipeline dump→validação→offsets.json do pack — build id, cs2-dumper/Dumper-7/SchemaExplorer, validação no processo vivo e conversão de JSON por script versionado.
---

# Offset Toolchain

Cadeia determinística que leva o jogo instalado até um `offsets.json` versionado do pack: identifica o build, extrai o schema, valida em processo vivo e emite o arquivo no formato esperado.

## Quando usar

Quando o pedido for "dumpar offsets", "cs2-dumper", "Dumper-7", "SchemaExplorer", "atualizar offsets depois do patch", "converter o dump para offsets.json" ou "por que o offset parou de funcionar".

## Workflow

1. **Identificar o build** — Steam app build, versão do módulo, data do patch. Sem build id, o dump é órfão.
2. **Escolher a fonte** — dumper específico da engine (ver tabela abaixo).
3. **Rodar o dump** — jogo aberto quando exigido; anotar módulo e seção.
4. **Validar em processo vivo** — ler o campo, conferir plausibilidade (health 0–100, view matrix com `w≈1`).
5. **Converter para o schema do pack** — script versionado que lê o JSON bruto e emite `offsets.json`.
6. **Marcar voláteis** — view matrix, campos que mudam por frame.
7. **Commitar com build id** — diff de schema é o changelog dos offsets.
8. **Automatizar** — job de CI por patch que roda o dumper, diffa e abre PR.

## Referência técnica

### Fonte por engine

| Engine | Ferramenta | Saída |
|---|---|---|
| Source 2 | `cs2-dumper`, `source2gen`, SchemaExplorer | `cs/`, `hpp/`, `json/`, `rs/`, `zig/` |
| Unreal | Dumper-7 (injetado) | `C:\Dumper-7` com SDK e offsets |
| Unity il2cpp | dump de `global-metadata.dat` + offsets | classes e campos |
| Genérico | AOB scan em memória (ver `attach-offsets`) | padrão + offset |

### Passo a passo do Source 2

```bash
# 1) jogo rodando; 2) dump
cargo run --release --manifest-path cs2-dumper/Cargo.toml
# saída em cs2-dumper/output/{cs,hpp,json,rs,zig}
ls output/json | head
```

- `output/json/offsets.json` traz endereços de interface e offsets de globais.
- `output/json/client_dll.json` traz classes e campos do `client.dll`.

### SchemaExplorer (referência)

- Filtro por módulo (`module:client`) e por offset (`offset:0x...`).
- Útil para achar um campo sem rodar dumper local.
- Tratar como referência, não como fonte de verdade do build que você está rodando.

### Validação em processo vivo

```text
- health lido em [0, 100] (ou [0, max] da engine)
- view matrix: última coluna ≈ (0,0,0,1), w no W2S positivo
- entity list: primeira entrada não nula e com vtable plausível
- local player: handle resolve para uma entidade com posição dentro do mapa
- campo novo: mudar de valor quando o estado muda (atirar, andar, morrer)
```

### Formato de saída do pack

```json
{
  "game": "cs2",
  "build": "13981",
  "module": "client.dll",
  "offsets": {
    "local_player": { "chain": [0x16C8F40, 0x0], "volatile": false },
    "entity_list":  { "chain": [0x1A3C4D8, 0x10], "stride": 0x78, "volatile": false },
    "view_matrix":  { "chain": [0x1A2B3C0], "volatile": true },
    "health":       { "offset": 0x344 }
  }
}
```

### Regras de emissão

- Um bloco por jogo; sem duplicar chave entre módulos.
- `build` obrigatório; ausente = arquivo inválido.
- `volatile: true` para o que muda por frame (view matrix, punch angle).
- `stride` explícito quando a entidade é iterada como array.
- Namespace `off` no código gerado; nomes `snake_case`.

## Exemplo

Conversão completa do JSON do cs2-dumper para o `offsets.json` do pack:

```python
#!/usr/bin/env python3
"""Convert cs2-dumper JSON output into the pack offsets.json schema."""
import json
import sys
from pathlib import Path

MODULE = "client.dll"

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def class_field(schema, class_name, field):
    try:
        fields = schema[MODULE]["classes"][class_name]["fields"]
        raw = fields[field]
        return int(raw, 0) if isinstance(raw, str) else int(raw)
    except (KeyError, TypeError):
        return None

def module_offset(schema, name):
    try:
        raw = schema[MODULE]["offsets"][name]
        return int(raw, 0) if isinstance(raw, str) else int(raw)
    except (KeyError, TypeError):
        return None

def build_offsets(client_schema, offsets_schema, build_id):
    out = {
        "game": "cs2",
        "build": str(build_id),
        "module": MODULE,
        "offsets": {},
    }
    entity_list = module_offset(offsets_schema, "dwEntityList")
    view_matrix = module_offset(offsets_schema, "dwViewMatrix")
    local_player = module_offset(offsets_schema, "dwLocalPlayerController")
    health = class_field(client_schema, "C_BaseEntity", "m_iHealth")
    team = class_field(client_schema, "C_BaseEntity", "m_iTeamNum")
    pawn = class_field(client_schema, "CCSPlayerController", "m_hPlayerPawn")

    if entity_list is not None:
        out["offsets"]["entity_list"] = {"chain": [entity_list, 0x10], "stride": 0x78}
    if view_matrix is not None:
        out["offsets"]["view_matrix"] = {"chain": [view_matrix], "volatile": True}
    if local_player is not None:
        out["offsets"]["local_player"] = {"chain": [local_player, 0x0]}
    if health is not None:
        out["offsets"]["health"] = {"offset": health}
    if team is not None:
        out["offsets"]["team"] = {"offset": team}
    if pawn is not None:
        out["offsets"]["player_pawn"] = {"offset": pawn}
    return out

def main():
    if len(sys.argv) < 4:
        print("usage: convert.py <client_dll.json> <offsets.json> <build_id>")
        raise SystemExit(2)
    client = load_json(sys.argv[1])
    globs  = load_json(sys.argv[2])
    result = build_offsets(client, globs, sys.argv[3])
    out_path = Path(sys.argv[2]).with_name("pack_offsets.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    print(f"wrote {out_path} ({len(result['offsets'])} entries)")

if __name__ == "__main__":
    main()
```

Verificação mínima do resultado:

```python
def sanity(off):
    assert off["build"], "missing build id"
    mv = off["offsets"].get("view_matrix")
    assert mv and mv.get("volatile") is True, "view matrix must be volatile"
    for name, entry in off["offsets"].items():
        assert "chain" in entry or "offset" in entry, f"{name} has no locator"
    return True
```

Auto-update por patch:

```bash
# run after each game patch in CI
cargo run --release --manifest-path cs2-dumper/Cargo.toml
python3 convert.py output/json/client_dll.json output/json/offsets.json "$(date +%s)"
git diff --stat pack_offsets.json
```

## Armadilhas

- Dump com o jogo no menu ≠ dump em partida: entity list só está populada em jogo.
- View matrix é volátil por frame; marcar como estável gera leitura podre no próximo tick.
- Build id ausente faz o arquivo parecer válido e quebrar silenciosamente no patch seguinte.
- Schema do `server.dll` não é o mesmo do `client.dll`; misturar dá offset que existe no papel e não na memória.
- AOB com wildcards demais gera match múltiplo e offset aleatório.
- Validar só "leu sem crashar" não é validar: campo precisa mudar quando o estado muda.
- Reordenar chaves do JSON quebra o diff de CI; emitir ordenado.
- Copiar offset do SchemaExplorer sem confirmar o build local é fonte de erro intermitente.
- `stride` implícito (inferido) falha em pools com tamanho variável.
