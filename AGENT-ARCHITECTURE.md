# Agent Architecture - Ollama Code

## Hierarchie

```
┌─────────────────────────────────────┐
│   HAUPTAGENT (Festlegbar via -m)   │
│   z.B. qwen3-coder:30b oder Claude  │
└──────────────┬──────────────────────┘
               │
               │ delegiert Aufgaben an
               │
      ┌────────┴────────┐
      ↓                 ↓
┌────────────┐    ┌────────────┐
│ Sub-Agent 1│    │ Sub-Agent 2│
│ granite4   │    │ gpt-oss:20b│
└────────────┘    └────────────┘
```

---

## Hauptagent festlegen

### Via CLI Parameter

```bash
# Qwen3-Coder als Hauptagent
npm run dev -- chat -m qwen3-coder:30b

# GPT-OSS als Hauptagent
npm run dev -- chat -m gpt-oss:20b

# Granite4 als Hauptagent (schnell!)
npm run dev -- chat -m granite4:micro

# Claude als Hauptagent (wenn verfügbar)
# (erfordert Claude API Key)
npm run dev -- chat -m claude-sonnet-3.5
```

### Via Config File

`~/.ollama-code/config.json`:
```json
{
  "defaultModel": "qwen3-coder:30b",  ← Hauptagent
  "ollamaUrl": "http://localhost:11434"
}
```

### Via Environment Variable

```bash
export DEFAULT_MODEL=qwen3-coder:30b
npm run dev
```

---

## Wie Sub-Agents gewählt werden

### Automatische Auswahl

Der **Hauptagent** entscheidet, welche Sub-Agents genutzt werden:

```typescript
// Hauptagent bekommt Aufgabe
hauptagent.run("Review code and write tests", {
  model: "qwen3-coder:30b"  // Hauptagent
});

// Hauptagent kann Sub-Agents nutzen:
// - Automatisch basierend auf Task-Type
// - Oder explizit via delegation tool
```

### Sub-Agent-Auswahl-Logik

```typescript
// Im Code
const SubAgentTypes = {
  CodeReviewer: {
    model: 'qwen3-coder:30b',  // Beste Code-Qualität
    systemPrompt: 'Code review specialist'
  },
  FastExecutor: {
    model: 'granite4:micro',   // Schnellste Ausführung
    systemPrompt: 'Fast task executor'
  },
  Reasoner: {
    model: 'gpt-oss:20b',      // Bestes Reasoning
    systemPrompt: 'Reasoning specialist'
  }
};
```

---

## Beispiel-Workflows

### Workflow 1: Qwen Haupt + Granite Sub

```bash
$ npm run dev -- chat -m qwen3-coder:30b -v

ollama-code> Analyze this codebase:
  1. Find all TypeScript files (use fast sub-agent)
  2. Review each for bugs (use me, the main agent)
  3. Generate summary (use fast sub-agent)

[Main Agent: qwen3-coder:30b] Analyzing request...
[Sub-Agent: granite4:micro] Finding files...
  ✓ Found 42 files in 1.2s
[Main Agent: qwen3-coder:30b] Reviewing code...
  ✓ Found 3 issues in 24s
[Sub-Agent: granite4:micro] Generating summary...
  ✓ Summary created in 2.1s
```

### Workflow 2: GPT-OSS Haupt + Mixed Subs

```bash
$ npm run dev -- chat -m gpt-oss:20b -v

ollama-code> Complex project: Plan architecture,
  implement core features, write tests

[Main Agent: gpt-oss:20b] Planning...
  ✓ Architecture planned in 18s

[Sub-Agent: qwen3-coder:30b] Implementing features...
  ✓ Core implemented in 32s

[Sub-Agent: qwen3-coder:30b] Writing tests...
  ✓ Tests generated in 28s

[Main Agent: gpt-oss:20b] Final review...
  ✓ All good!
```

### Workflow 3: Granite Haupt (Speed-Focus)

```bash
$ npm run dev -- chat -m granite4:micro -v

ollama-code> Quick tasks:
  - Create 5 test files
  - Update README
  - Run bash commands

[Main Agent: granite4:micro] Speed mode activated...
  ✓ All done in 8.2s total!
```

---

## Hauptagent-Eigenschaften

| Hauptagent | Geschwindigkeit | Qualität | Best For |
|------------|----------------|----------|----------|
| **qwen3-coder:30b** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Code-intensive Projects |
| **gpt-oss:20b** | ⭐⭐⭐ | ⭐⭐⭐⭐ | Planning & Reasoning |
| **granite4:micro** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Speed, Simple Tasks |
| **llama3.1:8b** | ⭐⭐⭐⭐ | ⭐⭐⭐ | General Purpose |

---

## Delegation Control

### Implizite Delegation (Automatisch)

```bash
ollama-code> Help me with these tasks...
# Hauptagent entscheidet automatisch ob/wann delegiert wird
```

### Explizite Delegation

```bash
ollama-code> Delegate these to sub-agents:
  - Task 1: Use granite4:micro
  - Task 2: Use qwen3-coder:30b
  - Task 3: Use gpt-oss:20b
```

### Programmatische Kontrolle

```typescript
import { Agent } from './src/llm/agent.js';
import { SubAgentOrchestrator } from './src/llm/sub-agent.js';

// Hauptagent erstellen
const hauptagent = new Agent(config, toolManager, modelManager);

// Sub-Agent Orchestrator
const orchestrator = new SubAgentOrchestrator(config, toolManager, modelManager);

// Hauptagent nutzt Orchestrator für Delegation
const response = await hauptagent.run('Complex task', {
  model: 'qwen3-coder:30b'  // Hauptagent festgelegt!
});
```

---

## CLI Flags Übersicht

```bash
# Hauptagent festlegen
npm run dev -- chat -m qwen3-coder:30b

# Mit Verbose (zeigt Sub-Agent Calls)
npm run dev -- chat -m qwen3-coder:30b -v

# Custom Ollama Server
npm run dev -- chat -m qwen3-coder:30b --url http://remote:11434

# Temperature anpassen
npm run dev -- chat -m gpt-oss:20b -t 0.5

# Alles kombiniert
npm run dev -- chat -m qwen3-coder:30b -v -t 0.7 --url http://localhost:11434
```

---

## Empfohlene Setups

### Setup 1: Balanced (Empfohlen)
```bash
# Hauptagent: Qwen (beste Code-Qualität)
# Sub-Agents: Mix aus Granite (speed) + GPT-OSS (reasoning)
npm run dev -- chat -m qwen3-coder:30b -v
```

### Setup 2: Speed-Focused
```bash
# Hauptagent: Granite (schnellste Antworten)
# Sub-Agents: Auch Granite für Konsistenz
npm run dev -- chat -m granite4:micro -v
```

### Setup 3: Quality-Focused
```bash
# Hauptagent: Qwen (beste Qualität)
# Sub-Agents: Nur Qwen + GPT-OSS (keine Kompromisse)
npm run dev -- chat -m qwen3-coder:30b -v
```

---

## Wichtige Hinweise

1. **Hauptagent ist der Boss**
   - Entscheidet über Delegation
   - Koordiniert Sub-Agents
   - Fasst Ergebnisse zusammen

2. **Sub-Agents sind Specialists**
   - Führen spezifische Aufgaben aus
   - Berichten an Hauptagent zurück
   - Keine direkte User-Interaktion

3. **Model Loading**
   - Erster Aufruf lädt Model (~2-5s)
   - Weitere Aufrufe nutzen Cache (schnell!)
   - Sub-Agents teilen sich Cache

---

## Zusammenfassung

```bash
# DU legst den Hauptagenten fest:
npm run dev -- chat -m <DEIN_MODELL> -v

# Beispiele:
npm run dev -- chat -m qwen3-coder:30b -v   # Code-Profi
npm run dev -- chat -m gpt-oss:20b -v       # Reasoning-Experte
npm run dev -- chat -m granite4:micro -v    # Speed-Demon

# Der Hauptagent nutzt dann automatisch passende Sub-Agents!
```

---

**Fertig zum Loslegen:**
```bash
cd /home/core/dev/bricked-code/ollama-code
npm run dev -- chat -m qwen3-coder:30b -v
```

Dein Hauptagent (qwen3-coder:30b) ist bereit! 🚀
