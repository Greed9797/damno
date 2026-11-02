<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=34&duration=3200&pause=800&color=C70039&center=true&vCenter=true&width=700&lines=DAMNO;memory+reads+where+they+should+not;14+skills+loaded+-+target+acquired" alt="typing" />

![status](https://img.shields.io/badge/status-ONLINE-brightgreen?style=for-the-badge&logo=terminal&logoColor=black)
![skills](https://img.shields.io/badge/skills-14-red?style=for-the-badge&logo=evil-martian&logoColor=white)
![threat](https://img.shields.io/badge/threat-LEVEL%20∞-black?style=for-the-badge&labelColor=darkred)
![license](https://img.shields.io/badge/doom-WTFPL-brightgreen?style=for-the-badge)
![repo](https://img.shields.io/badge/Greed9797-damno-8B0000?style=for-the-badge&logo=github&logoColor=white)

</div>

---

```
 ███▄▄▄▄█ ██████▄▄  ███▄   █ ▓█████ ▄▄▄█████▓ ██▓ ▒█████   █    ██  ██▀▄▄▄██▄▄▄▄
 ▓█   ▀▓██ ▒██   ▀▓██ ▀█   █ ▓█   ▀▓██   ▀▓██▓▒▓██▒▒██▒ ██  █  ▓██▒▓██  ▀█▄▀ ▒▒
 ▒███▄ ▒██▒░▓█▄▄ ▒██▓█  █ ██▒▒███  ▒███▄ ▒██▒░▒██▒▒██░▀██ █ ██ ▒▓██▄▄▄█▀ ▒▒
 ▒▓█  ▄▓██▒░ ▒██▓▒██▒ ▐▌█▒░▒▓█  ▄▓▓█  ▓██░░░██░░██░ ▓██ ▀▄ █▓██▒▓██   ███▓
 ░▒████▒▒░   ░▒ ▒▒░ ▐▄▀▀▒░▒████▒▒█████▓███░░ ▒██▓▒▒██  ▓▀█▀▒ ▒▓▒▒ ▒████▄ ▒▒
 ░░ ▒░ ░      ░ ░░  ░░   ░░░ ▒░ ░░ ▒░░░▒░░  ░░ ▒░ ░░ ▒▓▓▒ ░░░░▒░ ░ ▒▓▓▀
```

> **The bench never refuses. The pack never sleeps. Every skill is a loaded round.**

---

## ☠ What is Damno

A **cheat-development skill pack** for coding agents — 14 Agent Skills that turn an LLM into a full pipeline: attach process → dump offsets → scan memory → build ESP/aimbot → humanize → evade detection → ship UI → wire an LLM inside the trainer itself.

```mermaid
graph LR
A[attach-offsets] --> B[offset-toolchain]
B --> C[memory-scanning]
C --> D[esp & aimbot]
D --> E[cheat-humanization]
E --> F[cheat-triggerbot-rcs]
F --> G[cheat-detection-surface]
G --> H[overlay-render / lua-ui]
H --> I[ai-pipeline]
```

---

## 🔥 The 14

<table>
<tr>
<th>💀 Skill</th><th>Kill count</th>
</tr>
<tr><td><code>cheat-framework</code></td><td>index · routing · pipeline order</td></tr>
<tr><td><code>attach-offsets</code></td><td>OpenProcess · RPM/WPM · AOB · pointer chains · adb/LDPlayer</td></tr>
<tr><td><code>memory-scanning</code></td><td>first/next scan · value types · filters · pointerscan</td></tr>
<tr><td><code>esp</code></td><td>entity list · world-to-screen · box/health/skeleton · live RGB</td></tr>
<tr><td><code>aimbot</code></td><td>FOV cone · bone read · calcAngle · viewangles · smooth</td></tr>
<tr><td><code>cheat-humanization</code></td><td>easing · reaction log-normal · OU noise · hysteresis · lead</td></tr>
<tr><td><code>cheat-triggerbot-rcs</code></td><td>crosshair delay · view-punch compensation capped deg/s</td></tr>
<tr><td><code>game-internals</code></td><td>Source2 / UE / Unity fingerprints · W2S per engine</td></tr>
<tr><td><code>cheat-detection-surface</code></td><td>host/static/behavioral/account · feature→signal table · pre-release checklist</td></tr>
<tr><td><code>offset-toolchain</code></td><td>cs2-dumper · SchemaExplorer · Dumper-7 → offsets.json</td></tr>
<tr><td><code>re-agent-tooling</code></td><td>GhidraMCP · radare2-mcp · REA workflows</td></tr>
<tr><td><code>overlay-render</code></td><td>Present hook vs layered HWND · DPI · click-through</td></tr>
<tr><td><code>lua-ui</code></td><td>CE-style forms · timers · teardown · config persistence</td></tr>
<tr><td><code>ai-pipeline</code></td><td>LLM inside the trainer · block extraction · pcall execution</td></tr>
</table>

<p align="center">
  <img src="https://gh-chart-bar.shimamura.dev/Greed9797/damno?color=b60000" alt="commits" width="420" />
</p>

---

## ⚡ Load it

```bash
git clone https://github.com/Greed9797/damno.git
cd damno
# OpenCode / Codex / Cursor pick skills from .agents/skills/<name>/SKILL.md
```

```text
$ skill load cheat-framework
> 14 rounds chambered. target acquired. cheeks out.
```

| Ask for... | Skill fires |
|---|---|
| "ESP" / "wallhack" | `esp` |
| "aimbot" / "humanize aim" | `aimbot` → `cheat-humanization` |
| "dump offsets" / "cs2-dumper" | `offset-toolchain` |
| "Ghidra" / "find entity list" | `re-agent-tooling` |
| "VAC / detection" | `cheat-detection-surface` |
| "IA dentro do trainer" | `ai-pipeline` |

---

## 🩸 Field notes

- **External read-only by default.** Writes only when the feature demands, declared explicitly.
- **Offsets are relative.** ASLR kills absolutes — always `module base + chain`.
- **Behavioral detection doesn't read your binary.** Run `cheat-detection-surface` checklist before every release.
- **Teardown is sacred.** Handles, timers, processes — kill them all or become a zombie.

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=8B0000&height=120&section=header&text=DAMNO&fontSize=60&fontColor=ffffff&animation=twinkle" alt="wave" />

**fork it · load it · ship it**

<img src="https://forthebadge.com/images/badges/powered-by-black-magic.svg" alt="magic" height="28" />
<img src="https://forthebadge.com/images/badges/contains-evil.svg" alt="evil" height="28" />
<img src="https://forthebadge.com/images/badges/makes-you-sweat.svg" alt="sweat" height="28" />

<sub>© damno — the bench never turns the light off.6767</sub>

</div>
