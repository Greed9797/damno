---
name: attach-offsets
description: Anexar a processo (Windows API), enumerar módulos, dumpar offsets por AOB/pointer chain e operar em emulador Android via adb.
---

# Attach & Offsets

Abrir o processo, localizar a base dos módulos e extrair offsets confiáveis. Base de tudo: sem endereço estável, nenhuma feature funciona.

## Quando usar

Quando o pedido for anexar ao processo, achar base de módulo, dumpar offsets (AOB, pointer chain, struct layout, entity list), montar `offsets.json` versionado, ou anexar a jogo rodando em LDPlayer/emulador Android.

## Workflow

1. **Enumerar processos** por nome (`HL.exe`, `CS2.exe`, `AC_Client.exe`, `explorer.exe`).
2. **Abrir handle** com `PROCESS_VM_READ | PROCESS_QUERY_INFORMATION` (+ `WRITE`/`OPERATION` se editar).
3. **Mapear módulos** do processo e obter `base` + `size` do módulo do jogo.
4. **Dumpar offsets** — AOB signature, resolver a referência instrucional, validar ponteiro.
5. **Dump de struct** — vtable, campos e stride; localizar entity list por AOB.
6. **Versionar** em `offsets.json` com `game` + `build`.
7. **Android**: subir `adb`, `adb connect`, mapear `/proc/<pid>/maps`, ler `/proc/<pid>/mem`.

## Referência técnica

### Windows — APIs

```cpp
HANDLE h = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, FALSE, pid);
BOOL ok = ReadProcessMemory(h, (LPCVOID)addr, buf, size, &bytesRead);
BOOL wok = WriteProcessMemory(h, (LPVOID)addr, buf, size, &bytesWritten);
```

- External: handle de leitura; overlay em processo separado. Vantagem: isolamento do jogo, sem injeção.
- `PROCESS_VM_WRITE` só quando necessário; negar/pedir o mínimo.

### Enumeração de processos

```cpp
#include <tlhelp32.h>

DWORD findPid(const wchar_t* name) {
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  PROCESSENTRY32W pe{ sizeof(pe) };
  if (Process32FirstW(snap, &pe)) {
    do {
      if (!_wcsicmp(pe.szExeFile, name)) { CloseHandle(snap); return pe.th32ProcessID; }
    } while (Process32NextW(snap, &pe));
  }
  CloseHandle(snap);
  return 0;
}
```

### Módulos (base + size)

```cpp
#include <psapi.h>

MODULEINFO mi{};
HMODULE mod = GetModuleHandleA("game.exe");
GetModuleInformation(h, mod, &mi, sizeof(mi));
// mi.lpBaseOfDll, mi.SizeOfImage
```

### AOB signature scan

Assinatura com máscara `??` = curinga. Converte pattern em bytes + máscara, varre `[base, base+size)` e retorna o primeiro hit relativo à base.

```cpp
// pattern: "48 8B 05 ?? ?? ?? ??", mask: 1 = compare, 0 = wildcard
uintptr_t aobScan(HANDLE h, uintptr_t base, size_t size,
                  const std::vector<uint8_t>& pat, const std::vector<uint8_t>& mask) {
  std::vector<uint8_t> buf(size);
  if (!ReadProcessMemory(h, (LPCVOID)base, buf.data(), size, nullptr)) return 0;
  for (size_t i = 0; i + pat.size() <= size; ++i) {
    bool hit = true;
    for (size_t j = 0; j < pat.size(); ++j) {
      if (mask[j] && buf[i + j] != pat[j]) { hit = false; break; }
    }
    if (hit) return base + i;
  }
  return 0;
}
```

Depois do hit, ler o deslocamento `rel32` da instrução e resolver: `target = hit + instrLen + rel32` para padrões `48 8B 05`.

### Struct layout

- vtable: primeiro ponteiro do objeto.
- Campos: offsets com stride conforme tipo (`int` 4, `float` 4, ponteiro 8 em x64).
- Validar cada campo por coerência (ex.: health entre 0 e máx).

### Dumper de entity list

- Achar por AOB a instrução que referencia a lista.
- Validar: `readPointer(list + i*stride)` produz ponteiros válidos e contagem plausível (ex.: 1..64 no mesmo bloco).
- Se metade das entradas falha, o stride está errado.

### Android / LDPlayer 9

```bash
adb connect 127.0.0.1:5555
adb devices
adb shell ps -A | grep game
adb shell cat /proc/<pid>/maps | grep -i game
adb root
adb shell su -c "dd if=/proc/<pid>/mem of=/sdcard/dump.bin bs=1 skip=$((0x10000000)) count=4096"
adb pull /sdcard/dump.bin
```

- `/proc/<pid>/mem` exige root.
- Base do módulo: primeira linha `r-xp` do módulo em `/proc/<pid>/maps`.

## Exemplo

Script bash de dump via adb:

```bash
#!/usr/bin/env bash
set -euo pipefail

PKG="com.example.game"
PID=$(adb shell pidof "$PKG" | tr -d '\r')
echo "pid=$PID"

BASE=$(adb shell su -c "grep -m1 'r-xp' /proc/$PID/maps | grep -i "$PKG"" \
  | awk '{print $1}' | cut -d'-' -f1)
echo "base=0x$BASE"

adb shell su -c "dd if=/proc/$PID/mem of=/sdcard/base.bin bs=1 skip=$((16#$BASE)) count=$((0x40000))"
adb pull /sdcard/base.bin ./base.bin
```

AOB scan em Python sobre o dump:

```python
import re

def aob_scan(data: bytes, pattern: str) -> int:
    parts = pattern.split()
    rx = b""
    for p in parts:
        rx += b"." if p in ("??", "?") else re.escape(bytes([int(p, 16)]))
    m = re.search(rx, data, re.DOTALL)
    return m.start() if m else -1

with open("base.bin", "rb") as f:
    blob = f.read()

off = aob_scan(blob, "48 8B 05 ?? ?? ?? ??")
print("hit at file offset 0x%X" % off if off >= 0 else "not found")
```

## Armadilhas

- ASLR: nunca usar endereço absoluto; sempre relativo à base do módulo.
- Ponteiro que precisa de 2–3 níveis: ler um nível só devolve o endereço do container, não o campo.
- Kernel anti-cheat lê do kernel: `ReadProcessMemory` em userland falha silenciosamente (retorna 0 / dados zerados, não erro óbvio).
- `GetModuleHandleA` só vale no processo do próprio chamador — para outro processo, use `EnumProcessModules`/snapshot com o handle.
- `ReadProcessMemory` em página `NOACCESS` falha inteira; checar `bytesRead` e `GetLastError`.
- AOB que encontra múltiplos hits: pegar o primeiro é loteria — validar o contexto (instrução anterior/seguinte).
- Em Android, `adb connect` some após reboot do emulador; reconectar antes do dump.
