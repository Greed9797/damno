---
name: game-internals
description: Mapa por engine (Unreal, Unity il2cpp/mono, Source/Source2, custom) — entity registry, transforms, bones, tick vs frame, netcode e world-to-screen por engine.
---

# Game Internals

O modelo de dados do jogo: onde vivem as entidades, como os transforms se ligam aos bones, como o tick simulado se separa do frame renderizado e como cada engine projeta um ponto 3D na tela.

## Quando usar

Quando o pedido for "achar a entity list", "por que o ESP está em posição errada", "como funciona il2cpp/mono", "GWorld/GNames/ProcessEvent", "schema do Source 2", "world-to-screen", "converter posição 3D para tela" ou "entender o tick do servidor".

## Workflow

1. **Fingerprint da engine** — strings, módulos, imports, formato de arquivos (pak, assets, dlls).
2. **Encontrar o registry** — a estrutura que contém todas as entidades (lista, mapa, pool com handles).
3. **Mapear transform hierarchy** — local → world, root component, bone array.
4. **Separar sim de render** — tick do servidor, client prediction, snapshot interpolation.
5. **Achar a câmera** — posição, rotação, FOV, view/projection matrix.
6. **Implementar W2S** — fórmula da engine.
7. **Validar** — desenhar um ponto na origem do bone cabeça e conferir que acompanha o personagem.

## Referência técnica

### Fingerprints

| Engine | Sinais |
|---|---|
| Unreal | `GWorld`, `GNames`, `GObjects`, `ProcessEvent`, `PersistentLevel`, recompilação por build |
| Unity il2cpp | `GameAssembly.dll`, `global-metadata.dat`, `il2cpp_domain_get_assemblies` |
| Unity mono | `mono-2.0-*.dll`, root domain walk, vtable por classe |
| Source / Source2 | `client.dll`/`server.dll`, `CEntityIdentity`, schema system, `CUserCmd` |
| Custom | dataflow observável: input → sim → render |

### Entity registry por engine

**Unreal**

```text
GWorld -> PersistentLevel -> AActor** (array com contagem)
GObjects -> array de UObject* (todos os objetos, não só atores)
GNames   -> pool de FName (strings internas)
```

- `ProcessEvent` permite chamar UFunctions por índice.
- Replicação: propriedades marcadas `Replicated` chegam por snapshot delta.

**Unity il2cpp**

```text
il2cpp_domain_get_assemblies -> il2cpp_class_from_name
il2cpp_class_get_fields / il2cpp_field_get_offset
static_fields -> bloco de estáticos da classe
```

- Offsets de campo mudam por build; sempre derivar de `global-metadata.dat` do build atual.

**Unity mono**

- Root domain → assemblies → image → class → vtable.
- `mono_class_get_field_from_name` para resolver offset em runtime.

**Source2**

- Entity list em chunks (tipicamente 0x200 entradas por chunk, ponteiro de array de ponteiros).
- Schema system documenta classes e campos: `client.dll` schema.
- `CEntityIdentity` liga handle ao `CBaseEntity`.

### Transforms e bones

- Cada bone é tipicamente `vec3` (3 floats) ou matriz `3x4`; stride 12, 16 ou 48 conforme engine.
- Bone array é relativa ao entity root; pegar índice do bone (head, neck, pelvis) de um dump.
- Bounds: caixa local transformada para mundo; health é campo separado.

### Tick vs frame

- **Server tick**: taxa fixa (64 tick, 128 tick), simula movimento e dano.
- **Client frame**: renderiza em taxa variável, interpola entre snapshots.
- **Prediction**: cliente simula seu próprio movimento antes do servidor confirmar.
- **Lag compensation**: servidor rebobina posições para validar tiros.

Posição lida da memória pode ser do tick mais recente, não do frame renderizado — daí o "atraso" do ESP em alvo rápido.

### Netcode

- **Snapshot delta**: só campos alterados são transmitidos.
- **Interest management**: entidades fora de visão/alcance podem não ser replicadas — ESP em mapa grande pode não ver quem está longe.
- **Interpolação**: o cliente mostra ~1–2 ticks no passado.

### World-to-screen

Source (row-major, `m[12..15]` é a linha de perspectiva):

```text
v = VP * pos
if v.w < 0 then cull end
x = v.x / v.w
y = v.y / v.w
screen_x = (x * 0.5 + 0.5) * width
screen_y = (1 - (y * 0.5 + 0.5)) * height   -- Y flip
```

Unreal (rotação + FOV da POV da câmera):

```text
rel  = pos - cam_pos
view = rel . cam_basis
if view.forward <= 0 then cull end
sx = (view.right / view.forward) / tan(fov_x/2)
sy = (view.up    / view.forward) / tan(fov_y/2)
screen_x = (sx * 0.5 + 0.5) * width
screen_y = (0.5 - sy * 0.5) * height
```

Unity (view * projection, origem inferior-esquerda):

```text
v = viewProj * pos
ndc = v.xyz / v.w
screen_x = (ndc.x * 0.5 + 0.5) * width
screen_y = (1 - (ndc.y * 0.5 + 0.5)) * height
```

Forma comum:

```text
v = VP * vec4(pos, 1)
if v.w < 0 then behind camera, cull end
x = v.x / v.w
y = v.y / v.w
screen = ((x * 0.5 + 0.5) * w, (1 - (y * 0.5 + 0.5)) * h)
```

## Exemplo

Ler schema dump do Source 2 e extrair offset de um campo:

```python
import json
import sys

def load_schema(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def field_offset(schema, module, class_name, field):
    try:
        cls = schema[module]["classes"][class_name]
        return int(cls["fields"][field], 0) if isinstance(cls["fields"][field], str) \
               else int(cls["fields"][field])
    except KeyError:
        return None

def main():
    schema = load_schema(sys.argv[1])
    module = "client.dll"
    probes = [
        ("C_BaseEntity",  "m_iHealth"),
        ("CCSPlayerController", "m_hPlayerPawn"),
    ]
    for cls, fld in probes:
        off = field_offset(schema, module, cls, fld)
        print(f"{cls}.{fld} = {hex(off) if off is not None else 'NOT FOUND'}")

if __name__ == "__main__":
    main()
```

Shape esperado do JSON do dumper:

```json
{
  "client.dll": {
    "classes": {
      "C_BaseEntity": {
        "fields": {
          "m_iHealth": 344
        }
      },
      "CCSPlayerController": {
        "fields": {
          "m_hPlayerPawn": 1616
        }
      }
    }
  }
}
```

W2S em Lua, Source-like:

```lua
local function world_to_screen(vp, pos, w, h)
  local x = vp[1]*pos.x  + vp[2]*pos.y  + vp[3]*pos.z  + vp[4]
  local y = vp[5]*pos.x  + vp[6]*pos.y  + vp[7]*pos.z  + vp[8]
  local z = vp[13]*pos.x + vp[14]*pos.y + vp[15]*pos.z + vp[16]
  if z < 0.001 then return nil end
  return (x/z * 0.5 + 0.5) * w, (1 - (y/z * 0.5 + 0.5)) * h
end
```

## Armadilhas

- Stride errado no loop de entidades gera posições fantasma para metade da lista.
- Ler a matriz no layout errado (column-major vs row-major) inverte a tela.
- Offset de campo il2cpp muda a cada build; hardcode sobrevive até o próximo patch.
- Assumir que toda entity visível no servidor está replicada no cliente (interest management corta).
- Ignorar prediction e interpolação faz o ESP atirar atrás de alvo em movimento.
- Bone array sem validar o índice lê lixo de outro bone.
- W2S com `w` muito pequeno gera coordenada gigante; clampar e descartar.
- `GObjects` inclui objetos não-atores; filtrar por classe antes de iterar.
- Câmera em primeira vs terceira pessoa muda a origem do W2S; validar a `eyePos` correta.
