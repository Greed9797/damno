---
name: re-agent-tooling
description: Ordem de RE agêntico com GhidraMCP, radare2-mcp e REA — do dump estático à assinatura de função e validação em processo vivo, com fluxo de achar entity list sem dumper.
---

# RE Agent Tooling

Como usar ferramentas de reverse engineering dirigidas por agente no ciclo do pack: Ghidra e radare2 expostos por MCP, mais REA para triagem, com a mesma ordem de trabalho do começo ao fim.

## Quando usar

Quando o pedido for "achar a função", "Ghidra MCP", "radare2 MCP", "assinatura para AOB", "não tem dumper para esse jogo", "analisar o binário" ou "triagem de RE".

## Workflow

1. **Dump estático primeiro** — `offset-toolchain`. Se existe dumper, não abrir disassembler.
2. **Triagem** — REA ou `strings`/headers para identificar engine, módulos e símbolos.
3. **Função específica** — GhidraMCP: localizar por string/xref, decompilar, renomear.
4. **Padrão sem dumper** — radare2 byte pattern search para construir AOB.
5. **Validação viva** — ler o valor no processo (`memory-scanning`), conferir semântica.
6. **Emitir offset** — entrar no `offsets.json` com build id e `volatile` correto.
7. **Repetir só o delta** — patch novo, só a etapa que falhou.

## Referência técnica

### GhidraMCP

Setup:

```bash
# 1. install the GhidraMCP extension into Ghidra's Extensions folder
# 2. start Ghidra and open the target binary
# 3. start the HTTP server from the GhidraMCP plugin toolbar (default :8080)
# 4. run the MCP client against it
uvx --from git+https://github.com/LaurieWired/GhidraMCP ghidra-mcp \
  --ghidra-server http://127.0.0.1:8080/
```

Tools expostas: `decompile`, `rename`, `xrefs`, `strings`, `list_functions`, entre outras.

Config do cliente MCP:

```json
{
  "mcpServers": {
    "ghidra": {
      "command": "uvx",
      "args": [
        "--from", "git+https://github.com/LaurieWired/GhidraMCP",
        "ghidra-mcp", "--ghidra-server", "http://127.0.0.1:8080/"
      ]
    }
  }
}
```

- Porta errada: checar `Tool Options → GhidraMCP HTTP Server`.

### radare2-mcp

Pré-requisito: `r2 >= 5.8` no PATH.

```bash
git clone https://github.com/radareorg/radare2-mcp
cd radare2-mcp
npm ci
node dist/index.js
```

Config com diretório permitido:

```json
{
  "mcpServers": {
    "radare2": {
      "command": "node",
      "args": ["/opt/radare2-mcp/dist/index.js"],
      "env": { "ALLOWED_DIRS": "/samples:/targets" }
    }
  }
}
```

- Cerca de 85 tools: análise estática, emulação ESIL, busca de ROP, disassembly, xrefs.

### REA

```bash
rea open /path/to/client.dll
rea functions --filter entity
rea decompile 0x180012340
rea strings --min-len 6
```

- MCP e CLI; cobre binário nativo, JavaScript e managed.
- Bom para triagem inicial antes de abrir Ghidra em binário grande.

### Fluxo: achar entity list sem dumper

```text
1. SchemaExplorer / strings: existe schema exportado?
   -> sim: extrair offset direto
   -> nao: seguir para 2
2. GhidraMCP:
   - strings -> filtrar "entity"
   - xrefs na string -> funcao de registro
   - decompile -> identificar o campo de ponteiro global
   - rename do global e da funcao para fixar semantica
3. radare2:
   - /x <AOB> para achar o padrao em builds futuros
   - axt no endereco para confirmar referencias
4. Validacao viva:
   - ler o ponteiro no processo, percorrer entidades
   - conferir vtable/valor plausivel
5. Emitir offset no offsets.json com build id
```

### Sequência de prompts/tools

```text
1. list_functions(match="Entity")        -> candidatos
2. strings(min_len=5, match="entity")    -> referências
3. xrefs(address=<string_addr>)          -> funções que usam a string
4. decompile(address=<fn_addr>)          -> pseudocódigo
5. rename(address=<fn_addr>, name="EntityRegistry_Init")
6. xrefs(address=<global_addr>)          -> quem escreve o global
```

## Exemplo

```bash
# --- setup ---
uvx --from git+https://github.com/LaurieWired/GhidraMCP ghidra-mcp \
  --ghidra-server http://127.0.0.1:8080/

node /opt/radare2-mcp/dist/index.js &

rea open ./client.dll

# --- radare2: build an AOB from a known function ---
r2 -q -c "/x 488B05????????4885C0" -c "q" client.dll

# --- radare2: confirm references ---
r2 -q -c "axt @ 0x180012340" -c "q" client.dll
```

Sessão de agente correspondente:

```text
tool: radare2.search_bytes   args: { pattern: "488B05????????4885C0" }
tool: radare2.xrefs          args: { address: "0x180012340" }
tool: ghidra.decompile       args: { address: "0x180012340" }
tool: ghidra.rename          args: { address: "0x180012340", name: "GetEntityList" }
```

## Armadilhas

- Abrir Ghidra num `.exe` launcher quando o código está em `client.dll` desperdiça a análise.
- AOB com wildcards demais casa em vários pontos; apertar até um único match por build.
- Esquecer `ALLOWED_DIRS` no radare2-mcp bloqueia todo acesso a arquivo.
- Porta do GhidraMCP divergente do config gera timeout silencioso.
- Renomear símbolo sem confirmar pela validação viva fixa uma hipótese errada no projeto.
- Analisar função no disassembler quando o dumper já entrega o offset é o caminho mais longo.
- Confiar em símbolo parcialmente reconstruído (thunk, import) como se fosse a implementação.
- Não versionar a assinatura (AOB) junto do offset: o próximo patch perde a origem do valor.
