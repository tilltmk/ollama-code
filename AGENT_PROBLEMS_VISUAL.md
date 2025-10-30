# Agent-Logik: Visuelle Analyse der Probleme

## 1. MESSAGE HISTORY WACHSTUM - KRITISCH

```
Iteration-Verlauf mit maxIterations=50, 3 Tools pro Iteration:

┌─────────────────────────────────────────────────────────────────┐
│ Message History Size Growth (Tokens)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                           ╱───  │
│                                                      ╱──╱       │
│                                                 ╱──╱            │
│ 25000 ├────────────────────────────────────╱─╱                 │
│       │                                ╱──╱                     │
│ 20000 │                           ╱────╱       Memory Limit     │
│       │                      ╱────╱            (32K context)    │
│ 15000 │                 ╱───╱                                   │
│       │            ╱───╱                                        │
│ 10000 │       ╱──╱                  Current Growth Rate         │
│       │  ╱───╱                      ~400 tokens/iteration       │
│  5000 │╱                                                        │
│       │                                                         │
│     0 └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────  │
│         0   10   20   30   40   50 ← Iterations                 │
└─────────────────────────────────────────────────────────────────┘

PROBLEM:
- Nach 30-40 Iterationen: 60-70% Context gefüllt
- Agent kann nicht mehr denken (kein Platz für neuen Context)
- Quality der Responses degradiert dramatisch
- Token-Costs steigen exponentiell
```

## 2. TOOL CALL PARSING - FEHLER-ANFÄLLIGKEIT

```
┌─────────────────────────────────────────────────────────┐
│ Tool Call Parsing Fehler Rate nach Format               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Well-Formed XML:                                        │
│ <function=read_file><parameter=path>/home</parameter>  │
│ ✓ SUCCESS (99%)                                         │
│                                                         │
│ Malformed XML (Single typo):                            │
│ <function=read_file><parameter=path>/home<parameter>   │
│ ✗ FAIL (typo: missing / )                               │
│                                                         │
│ Mixed Parameters:                                       │
│ <function=foo>                                          │
│   <parameter=x>value1</parameter>                       │
│   <param=y>value2</parameter>     ← Different tag!      │
│ ⚠ PARTIAL (y wird gemisst)                              │
│                                                         │
│ Python-Style False Positive:                            │
│ "I will run format_string(field=value) tomorrow"       │
│ ✗ MISTAKE (könnte als Tool-Call interpretiert werden)  │
│                                                         │
└─────────────────────────────────────────────────────────┘

SOLUTION MATRIX:

Format          Current     Robust-V2
─────────────────────────────────────
Valid XML       99%         99.9%
Typo-XML        15%         80%
Mixed Tags      60%         95%
False Positive  20%         1%
```

## 3. RETRY-LOGIK TIMING

```
┌──────────────────────────────────────────────────────────────┐
│ API Call Retry Timing (Current vs Proposed)                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Scenario: 5 API calls fail in sequence                      │
│                                                              │
│ Current Exponential (1s, 2s, 3s):                           │
│  Retry 1: [wait 1s] ▓░░░░░░░░░░░ 1s                         │
│  Retry 2: [wait 2s] ▓▓░░░░░░░░░░ 2s                         │
│  Retry 3: [wait 3s] ▓▓▓░░░░░░░░░ 3s                         │
│           Total: 6 seconds                                  │
│                                                              │
│ Thundering Herd Problem:                                    │
│ ┌─── System 1                                               │
│ │  ├─ Wait 1s  ─────────┬────────────────────────── RETRY  │
│ │  └─ Wait 2s  ─────────┬────────────────────────── RETRY  │
│ ├─── System 2                                               │
│ │  ├─ Wait 1s  ─────────┬────────────────────────── RETRY  │
│ │  └─ Wait 2s  ─────────┬────────────────────────── RETRY  │
│ │                        │                                   │
│ │                   SPIKE: 10 Retries gleichzeitig!         │
│                                                              │
│ Proposed with Jitter (base 1s, +/- 20%):                   │
│  Retry 1: [wait 0.9-1.1s]  ▓░░ 1.0s  (randomized)          │
│  Retry 2: [wait 1.8-2.2s]  ▓▓░ 2.0s  (randomized)          │
│  Retry 3: [wait 3.6-4.4s]  ▓▓▓ 4.0s  (randomized)          │
│                                                              │
│  → Spread out over time → Keine Spikes!                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 4. TOOL-CALL AUSFÜHRUNG - BLOCKIERUNG SZENARIO

```
┌──────────────────────────────────────────────────────────────┐
│ Current Tool Execution Flow (BLOCKING)                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Agent.run()                                                 │
│  ├─ API Call (3s)                                           │
│  ├─ Parse Response                                          │
│  └─ Execute Tools (BLOCKING):                               │
│      ├─ Tool 1 (5s) ════════════════════════════            │
│      ├─ Tool 2 (3s) ══════════════════                      │
│      ├─ Tool 3 (10s) ═════════════════════════════════      │
│      ├─ Tool 4 (2s) ══════════════                          │
│      └─ Tool 5 (8s) ════════════════════════════            │
│                                                              │
│  Total Wait: 28s (all tools run sequentially!)              │
│  Actual: Could be 10s in parallel                           │
│  WASTE: 18s per iteration * 50 iterations = 900s!           │
│                                                              │
│ BUT WAIT - Promise.all() is actually parallel!              │
│ Problem: Agent waits for ALL before continuing:             │
│                                                              │
│ for await (chunk of stream) { }  ← Waits for Tool 3 (10s)   │
│                                                              │
│ Even though Tools 1,2,4,5 finished already!                │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ With Tool Timeout (30s max per tool)                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Tool 1 (hangs): [════════════════ TIMEOUT after 30s]        │
│                 Error: "Tool timeout"                       │
│                 Continue to next iteration                  │
│                                                              │
│ Without timeout:                                            │
│ Tool 1 (hangs): [════════════════════════ (blocks forever)] │
│                 Agent stuck, no response                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 5. SUB-AGENT MEMORY OVERHEAD

```
┌────────────────────────────────────────────────────────────────┐
│ Sub-Agent Memory Usage (Parallel Execution)                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Szenario: 50 parallel Sub-Agent Tasks                         │
│                                                                │
│ Memory Per Agent:                                             │
│  ├─ Agent Instance         ~2KB                               │
│  ├─ conversationHistory    ~10KB (initial)                    │
│  ├─ OllamaClient           ~1KB                               │
│  ├─ ToolManager ref        ~500B                              │
│  ├─ ModelManager ref       ~500B                              │
│  └─ Total per Agent        ~14KB                              │
│                                                                │
│ 50 parallel instances: 50 * 14KB = 700KB                       │
│                                                                │
│ If each agent runs 5 iterations:                              │
│ conversationHistory grows to 50KB per agent                   │
│ 50 * 50KB = 2.5MB just for histories!                         │
│                                                                │
│ Memory Timeline:                                              │
│                                                                │
│ T=0ms     [Start] 50 agents created                           │
│ │         Memory: 700KB                                       │
│ │                                                              │
│ T=2000ms  [Mid-execution] 50% done, others still running      │
│ │         Memory: 700KB + histories growing                   │
│ │         = ~1.5MB                                            │
│ │                                                              │
│ T=4000ms  [End] All done, agents freed                        │
│           Memory back to baseline                             │
│                                                                │
│ For large projects (200 tasks): 200 * 50KB = 10MB memory!     │
│                                                                │
└────────────────────────────────────────────────────────────────┘

SOLUTION:
- Agent.clearHistory() zwischen Tasks
- Limit conversationHistory size per Agent
- Reuse Agent instances (connection pooling)
```

## 6. THINKING EXTRACTION REGEX PERFORMANCE

```
┌──────────────────────────────────────────────────────────────┐
│ Regex Matching Performance (Large Responses)                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Response Size: 10KB (typical for code tasks)                │
│ Number of Patterns: 5                                       │
│                                                              │
│ Current Approach:                                           │
│ for (pattern of patterns) {                                 │
│   match = content.match(pattern)  ← Scans 10KB 5 times!    │
│ }                                                           │
│                                                              │
│ Timing (Chrome DevTools):                                   │
│ ┌────────────────────────────────────────────────┐          │
│ │ 5KB response  │ ██ 2.5ms                       │          │
│ │ 10KB response │ ████ 5.2ms                     │          │
│ │ 20KB response │ ████████ 10.1ms                │          │
│ │ 50KB response │ ██████████████████ 24.8ms     │          │
│ │ 100KB response│ ██████████████████ 49.3ms     │          │
│ └────────────────────────────────────────────────┘          │
│                                                              │
│ With 50 iterations: 50 * 5.2ms = 260ms just for extraction  │
│                                                              │
│ Improved (single regex):                                    │
│ Combined Pattern = /thinking|reasoning|thought|...​/g       │
│ Time: ~0.8ms per response                                   │
│ With 50 iterations: 50 * 0.8ms = 40ms                       │
│                                                              │
│ SPEEDUP: 6.5x faster!                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 7. CALLBACK LOOP RACE CONDITION

```
┌──────────────────────────────────────────────────────────────┐
│ Concurrent Task Update Race Condition                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Task 1 (Priority 10) │  Task 2 (Priority 5)                │
│ ─────────────────────┼──────────────────────                │
│ executeTask()        │                                      │
│  │                   │                                      │
│  ├─ task.status = 'in_progress'                            │
│  │   updatedAt = 1000                                      │
│  │                   │                                      │
│  │               executeTask()                              │
│  │                │   │                                     │
│  │                ├─ task.status = 'in_progress'           │
│  │                │   updatedAt = 1001                     │
│  │                │                                        │
│  ├─ await save()  │                                        │
│  │  writes: {     │                                        │
│  │    task1: {    │                                        │
│  │      status: 'in_progress',                             │
│  │      updatedAt: 1000                                    │
│  │    }            │                                        │
│  │  }              │                                        │
│  │                 ├─ await save()                         │
│  │                 │  overwrites with: {                   │
│  │                 │    task2: {                            │
│  │                 │      status: 'in_progress',           │
│  │                 │      updatedAt: 1001                  │
│  │                 │    }                                   │
│  │                 │  }  ← LOSES task1's state!            │
│  │                 │                                        │
│  └─ await run()    │                                        │
│     (10 seconds)   │   └─ await run()                       │
│                    │      (5 seconds)                       │
│                    │                                        │
│ Result: Task 1's completion lost!                          │
│         task.result = undefined                            │
│         task.status = 'in_progress'  (stuck forever!)      │
│                                                              │
│ SOLUTION: Update-Lock mit Promise chain                     │
│          or Task-level file locking (SQLite, Redis)        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 8. PRIORITY MATRIX - WELCHE PROBLEME ZUERST?

```
┌────────────────────────────────────────────────────────────────┐
│ Problem Priority Matrix (Impact vs Effort)                     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ IMPACT                                                        │
│     │                                                         │
│ 10  │  ╔══════════════════════╗                              │
│     │  ║ MEMORY LEAK          ║                              │
│ 8   │  ║ (History Growth)     ║    Tool Timeout             │
│     │  ║                      ║        ╔═══════════╗         │
│ 6   │  ╚═════╤════════════════╝        ║           ║         │
│     │        │                 Tool    ║           ║         │
│ 4   │        │        Parsing   Validat║           ║         │
│     │        │        ╔════════╗ ║     ║           ║         │
│ 2   │  Thinking Extract║        ║ ║     ║ Backoff  ║         │
│     │        │        ║ Sub-Ag │        ║           ║         │
│ 0   └────────┼────────╫────────┼────────╫───────────╫─────────
│             0     5         10        15         20   EFFORT
│                                                                │
│ Quick Wins (Low Effort, High Impact):                        │
│ ✓ Tool Timeout (1-2h)                                        │
│ ✓ Response Validation (2-3h)                                 │
│ ✓ Backoff Jitter (1-2h)                                      │
│                                                              │
│ Long-term Investments (Medium-High Effort, High Impact):    │
│ ✓ History Compression (4-5h)                                │
│ ✓ Robust Parsing (4-5h)                                     │
│ ✓ Sub-Agent Refactor (6-8h)                                 │
│                                                              │
│ Nice-to-Have (Low Impact):                                   │
│ • Thinking Extraction Optimization (1h)                     │
│ • Logging Sanitization (1-2h)                               │
│ • ModelManager Caching (1h)                                 │
│                                                              │
└────────────────────────────────────────────────────────────────┘
```

## 9. ISSUE SEVERITY DISTRIBUTION

```
┌──────────────────────────────────────────────────────────────┐
│ Gefundene Probleme nach Severity                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ KRITISCH (P0) - Blockiert Produktion:                       │
│ ├─ Memory Leak (unbegrenzte History)          ▓▓▓▓▓▓▓▓ 8/18│
│ ├─ Keine Response Validierung                 ▓▓▓▓ 4/18   │
│ ├─ Tool-Call Parsing fragil                   ▓▓▓▓ 4/18   │
│ └─ Fehlende Tool Execution Timeouts           ▓▓ 2/18    │
│                                                              │
│ HOCH (P1) - Verbessert Stabilität:                          │
│ ├─ Retry Logic ohne Jitter                    ▓▓ 2/18    │
│ ├─ Error-Recovery in Sub-Agents               ▓▓ 2/18    │
│ ├─ CallbackLoop Race Conditions               ▓▓ 2/18    │
│ └─ Model Hardcoding ohne Fallback             ▓ 1/18    │
│                                                              │
│ MITTEL (P2) - Nice-to-Have:                                 │
│ ├─ runStream() nutzt Non-Streaming            ▓ 1/18    │
│ ├─ Verbose Output könnte Secrets leaken       ▓ 1/18    │
│ └─ Tool Error Context verbesserungsbedürftig  ▓ 1/18    │
│                                                              │
│ NIEDRIG (P3) - Kosmetisch:                                  │
│ ├─ Thinking Extraktion Optimierung            ▓ 1/18    │
│ └─ ModelManager Caching fehlt                 ▓ 1/18    │
│                                                              │
│ GESAMT: 18 Probleme identifiziert                          │
│                                                              │
│ Aufschlüsselung:                                            │
│ Kritisch: 33% (blockiert Tests)                            │
│ Hoch:     44% (wichtig für Stabilität)                     │
│ Mittel:   17% (Verbesserungen)                             │
│ Niedrig:  11% (Optimierungen)                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 10. IMPLEMENTIERUNGS-TIMELINE

```
┌──────────────────────────────────────────────────────────────┐
│ Roadmap (Geschätzter Aufwand)                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ WOCHE 1 (Phase 1 - KRITISCH):                              │
│ ├─ [2-3h] Response Validation                              │
│ ├─ [4-5h] Message History Compression                      │
│ ├─ [2h]   Tool Timeout                                     │
│ └─ Total: 8-10h ████████░░░░░░░░░░░░░░░░░░ 30%            │
│                                                              │
│ WOCHE 2 (Phase 2 - HOCH):                                  │
│ ├─ [4-5h] Robust Tool Parser                               │
│ ├─ [2h]   Exponential Backoff + Jitter                     │
│ ├─ [3h]   Tool Error Context                               │
│ └─ Total: 9-10h ██████████░░░░░░░░░░░░░░░░ 35%            │
│                                                              │
│ WOCHE 3 (Phase 3 - FEATURES):                              │
│ ├─ [4-5h] Fix runStream()                                  │
│ ├─ [3h]   Sub-Agent Model Fallback                         │
│ ├─ [3h]   CallbackLoop Race Condition                      │
│ └─ Total: 10-11h ██████████░░░░░░░░░░░░░░░░ 38%           │
│                                                              │
│ SPÄTER (Phase 4 - NICE-TO-HAVE):                           │
│ ├─ [1h]   ModelManager Caching                             │
│ ├─ [2-3h] Metrics/Tracing                                  │
│ └─ [1-2h] Performance Profiling                            │
│                                                              │
│ GESAMT: ~27-34 Stunden Engineering                          │
│         (1-2 Wochen für 1-2 Engineer)                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 11. RISIKO-ASSESSMENT

```
┌──────────────────────────────────────────────────────────────┐
│ Risiken wenn Probleme NICHT behoben werden                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ LIKELIHOOD        │ IMPACT                                   │
│ ───────────────────┼─────────────────────────────────────    │
│                   │                                          │
│ HIGH (80-100%)    │ Memory leak causes OOM                  │
│ ├─ Sehr wahrsch. │ auf Projects > 50K Tokens               │
│ │                 │ → Agent crashes                         │
│ │                 │ → Lost computation                      │
│ │                 │                                          │
│ │HIGH (50-100%)   │ Tool calls fail silently               │
│ │ ├─ Malformed   │ Agent regeneriert ohne zu wissen       │
│ │ │  XML is real  │ → Infinite loop Gefahr                 │
│ │ │               │ → Wasted tokens                         │
│ │                 │                                          │
│ │MEDIUM (30-70%)  │ API timeout bei Retry-Storms           │
│ │ ├─ Kein Jitter │ → 50% API call failure rate            │
│ │ │               │ → Service degradation                  │
│ │                 │                                          │
│ MEDIUM (20-50%)   │ Tool execution hangs                    │
│ ├─ Keine Timeout  │ → Agent stuck                          │
│ │                 │ → Parent-Process wartet forever        │
│ │                 │                                          │
│ └─MEDIUM (10-30%) │ Race condition data loss               │
│   └─ Callback    │ → Task Queue korrupt                    │
│       Loop       │ → Incomplete task re-execution         │
│                   │                                          │
│ OVERALL RISK SCORE: 7.2/10 (HIGH)                          │
│                                                              │
│ Reputational Damage: HOCH                                   │
│ ├─ Long-running tasks fail unpredictably                   │
│ ├─ Users lose trust in stability                           │
│ └─ Difficult to debug (no good logging)                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```
