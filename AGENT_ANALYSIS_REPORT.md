# Agent-Logik Analysebericht

**Analysedatum:** 2025-10-29
**Analysierte Komponenten:**
- `src/llm/agent.ts` - Hauptagent-Klasse
- `src/llm/sub-agent.ts` - Sub-Agent Orchestrator
- `src/llm/ollama-client.ts` - Ollama API Client
- `src/llm/tool-format-parser.ts` - Tool Format Handling
- `src/llm/callback-loop.ts` - Callback Loop System
- `src/llm/model-manager.ts` - Modell-Verwaltung
- `src/tools/tool-manager.ts` - Tool Execution

---

## 1. ARCHITEKTUR-ANALYSE

### 1.1 Hauptkomponenten und deren Rollen

#### Agent Klasse (`agent.ts`)
**Verantwortung:** Hauptausführungs-Engine für LLM-basierte Agenten

**Struktur:**
```typescript
- OllamaClient: Kommunikation mit Ollama API
- ModelManager: Modellauswahl und Verwaltung
- ToolManager: Tool Registration und Execution
- conversationHistory: Message-History als Array
```

**Iterationszyklus:**
1. API-Call mit retry-Logik (bis 3 Versuche)
2. Response-Verarbeitung (Thinking-Extraktion, Tool-Normalisierung)
3. Tool-Call-Ausführung (parallel)
4. Tool-Results zur History hinzufügen
5. Neue Iteration bis zum finalen Response

**Konfiguration:**
- `maxIterations`: Standard 50 (erhöht von 10)
- `maxRetries`: Standard 3 für API-Calls
- `verbose`: Debug-Output

#### Sub-Agent Orchestrator (`sub-agent.ts`)
**Verantwortung:** Delegation von Aufgaben an spezialisierte Agenten

**Features:**
- Parallel-Execution von Tasks
- Sequential-Execution für abhängige Tasks
- Smart-Execution (Prioritätsgruppen-basiert)
- Task-States: pending, in_progress, completed, failed

**Sub-Agent-Typen:**
- CodeReviewer (qwen3-coder:30b)
- FastExecutor (granite4:micro)
- Reasoner (gpt-oss:20b)
- FileExpert (granite4:micro)

#### Callback Loop System (`callback-loop.ts`)
**Verantwortung:** Claude ↔ Ollama Handoff-System zur Timeout-Vermeidung

**Features:**
- Task-Queuing und Priorisierung
- Persistierung von Task-States (JSON)
- Claude-Review-Prompts generieren
- Retry-Mechanismus bei Fehlern

**Iteration-Limit:** 50 (maxIterations)

### 1.2 Message History Verwaltung

**Struktur (agent.ts lines 48, 66-71):**
```typescript
private conversationHistory: Message[] = [];

// Message-Typen:
- system: System-Prompt
- user: User-Eingabe
- assistant: LLM-Response (mit thinking und tool_calls)
- tool: Tool-Execution-Result
```

**Operationen:**
- `setSystemPrompt()`: Ersetzt existierende system-Message
- `addUserMessage()`: Append-Only
- `getHistory()`: Rückgabe der kompletten History
- `clearHistory()`: Entfernt alle außer system-Message

**Probleme:**
1. **Speicherlecks:** History wächst unbegrenzt mit jedem Iteration
2. **Keine Größen-Limits:** Große Projekte können Context-Fenster überlaufen
3. **Keine History-Kompression:** Alte Iterationen nicht zusammengefasst
4. **Denk-Prozess nicht gespeichert:** `thinking` wird in Message gespeichert, aber nicht persistent

---

## 2. GEFUNDENE PROBLEME

### 2.1 KRITISCHE PROBLEME (P0)

#### Problem 1: Memory Leak durch unbegrenzte History
**Dateien:** `src/llm/agent.ts` (lines 48, 184, 249)
**Severität:** KRITISCH
**Beschreibung:**
```typescript
// Jede Iteration fügt hinzu:
// 1. Assistant-Message (vollständiger Response)
// 2. Tool-Call-Results (eine Message pro Tool)
// Mit maxIterations=50 und 5+ Tools pro Iteration:
// potentiell 50 * 6 = 300+ Messages
```

**Impact:**
- Context-Fenster wird schnell gefüllt
- API-Latenz steigt exponentiell
- Kosten für längere Prompts
- Kann Token-Limits überschreiten (max_tokens Config wird nicht beachtet)

**Reproduktion:**
```
- maxIterations=50 mit jedem Tool-Call
- Nach ~20 Iterationen erreicht Context-Grenze
- Quality degradiert dramatisch
```

#### Problem 2: Fehlende Error-Recovery in tool_calls bei Formatierung
**Dateien:** `src/llm/tool-format-parser.ts` (lines 112-158)
**Severität:** KRITISCH
**Beschreibung:**

Tool-Call-Extraktion hat mehrere Fehler:

1. **Python-Pattern zu simpel:**
```typescript
// Zeile 138:
const pythonPattern = /\b(\w+)\s*\(\s*[^)]*\s*\)/g;
// Problem: Matched ALLE Funktionsaufrufe, auch nicht-Tools
// Z.B. "let x = parseInt(5)" würde matched
```

2. **XML-Format-Anfälligkeit:**
```typescript
// Zeile 118-119:
const xmlPattern = /<function[=\s]+[^>]+>[\s\S]*?<\/function>/g;
// Problem: Non-greedy .* kann bei mehreren Funktionen brechen
// Zudem unterschiedliche Klammer-Stile nicht gehändelt
```

3. **Keine Validierung gegen knownTools:**
```typescript
// Zeile 173-175:
const validCalls = extracted.filter(call =>
  knownTools.includes(call.function.name)
);
// Problem: Falls Filter alles removes, wird trotzdem mit leerem Array fortgefahren
```

**Impact:**
- Tool-Calls können silent dropped werden
- Agent müssen "halluzinierte" Tools aufrufen
- Error-Handling schlägt fehl

#### Problem 3: Retry-Logik hat exponentiellen Backoff, aber keine maximale Wartezeit
**Dateien:** `src/llm/agent.ts` (lines 142-162)
**Severität:** HOCH
**Beschreibung:**
```typescript
await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
// Mit 3 Retries: 1s, 2s, 3s = 6s Wartzeit
// Aber bei maxRetries=5: könnte 1+2+3+4+5=15s sein
// Keine Jitter, keine Exponential Backoff mit Basis
```

**Problem:** Deterministische Wartezeiten können zu Thundering Herd führen

#### Problem 4: Keine Validierung von Response-Struktur
**Dateien:** `src/llm/agent.ts` (lines 164-168)
**Severität:** HOCH
**Beschreibung:**
```typescript
if (!response) {
  throw new Error('Failed to get response after retries');
}
let assistantMessage = response.choices[0].message;
// Problem: Keine Checks für:
// - response.choices existiert?
// - response.choices[0] existiert?
// - message.content kann undefined sein
```

### 2.2 HOHE PRIORITÄT PROBLEME (P1)

#### Problem 5: Tool-Call-Parsing ist fragil
**Dateien:** `src/llm/tool-format-parser.ts` (lines 30-42)
**Severität:** HOCH
**Beschreibung:**
```typescript
// Regex hat mehrere Gruppen, aber keine Fehlerbehandlung
// Z.B. bei malformed XML:
// "<parameter=file_path>test.txt<parameter>" (fehlendes /)
// würde vollständig gemisst
```

**Fallbeispiel:**
```
Input: <function=read_file><parameter=path>/home/test</parameter><parameter=encoding>utf-8</parameter>
Output: Korrekt geparst

Input: <function=read_file><parameter=path>/home/test</parameter><param=encoding>utf-8</parameter>
Output: Encoding wird gemisst (typo in tag name)
```

#### Problem 6: Thinking-Extraktion ist zu simpel
**Dateien:** `src/llm/agent.ts` (lines 19-41)
**Severität:** MITTEL
**Beschreibung:**
```typescript
// Multiple Patterns aber:
// 1. Erstes Match wird genommen
// 2. Keine Verschachtelung möglich
// 3. Multiline-Handling könnte fehlschlagen bei CDATA

const thinkingPatterns = [
  /<thinking>([\s\S]*?)<\/thinking>/i,
  // ... weitere Patterns
];

// Problem:
// - Z.B. "<thinking>foo <!-- comment --> bar</thinking>"
// - würde nicht sauber geparst
```

#### Problem 7: Sub-Agent Fail-Stop bei Sequential, aber keine Callback
**Dateien:** `src/llm/sub-agent.ts` (lines 104-114)
**Severität:** MITTEL
**Beschreibung:**
```typescript
async executeSequential(tasks: SubAgentTask[], verbose: boolean = false): Promise<SubAgentResult[]> {
  for (const task of tasks) {
    const result = await this.executeTask(task, verbose);

    if (!result.success) {
      break; // Stoppt sofort, aber:
      // - Keine Notification an Parent
      // - Keine Kontextspeicherung für Retry
    }
  }
}
```

#### Problem 8: CallbackLoop hat Race-Conditions
**Dateien:** `src/llm/callback-loop.ts` (lines 105-114, 283-326)
**Severität:** MITTEL
**Beschreibung:**
```typescript
// Scenario: Parallel Task-Ausführung
// 1. Task 1 startet, updatedAt = T1
// 2. Task 2 startet, updatedAt = T2
// 3. Task 1 updated save(), save() schreibt T1-State
// 4. Task 2 updated save(), überschreibt mit T2-State
// 5. Task 1 hatte Updates, aber Task 2 überschreibt sie

// Problem: Kein Lock-Mechanismus, nur async/await
```

#### Problem 9: Modelname-Hardcoding in Sub-Agent-Types
**Dateien:** `src/llm/sub-agent.ts` (lines 170-187)
**Severität:** MITTEL
**Beschreibung:**
```typescript
export const SubAgentTypes = {
  CodeReviewer: {
    model: 'qwen3-coder:30b',  // Was wenn Modell nicht installiert?
    systemPrompt: '...'
  },
  // ...
};

// Keine Fallback-Logik wenn Modell nicht existiert
// Sollte ModelManager.selectModelForTask() verwenden
```

#### Problem 10: Callback Loop Status-Update Race
**Dateien:** `src/llm/callback-loop.ts` (lines 166-236)
**Severität:** MITTEL
**Beschreibung:**
```typescript
task.status = 'in_progress';
task.updatedAt = Date.now();
await this.save(); // Zwischen setzen und save() können andere Threads Task ändern

try {
  // Ausführung dauert lange
  const result = await agent.run(...);
} catch (error) {
  // Wenn save() fehlschlägt, Status ist inkonsistent
  task.error = error.message;
}
```

### 2.3 MITTLERE PRIORITÄT PROBLEME (P2)

#### Problem 11: ToolManager.executeTools() ignoriert Validierungsfehler
**Dateien:** `src/llm/agent.ts` (lines 212-250)
**Severität:** MITTEL
**Beschreibung:**
```typescript
// agent.ts line 213
const results = await this.toolManager.executeTools(assistantMessage.tool_calls);

// Problem: Wenn Validierung in tool-manager fehlschlägt:
// - Error-String wird zurückgegeben
// - Agent sieht nur Error-Message, nicht die Arguments
// - Schwer zu debuggen
```

**Beispiel:**
```
Tool-Call: { name: 'read_file', arguments: '{"path": 123}' }
Expected: { path: string }
Error: "Zod validation failed"
// Agent weiß nicht, dass der Typ falsch war
```

#### Problem 12: Exponential Backoff hat keine Obergrenze
**Dateien:** `src/llm/agent.ts` (lines 160)
**Severität:** MITTEL
**Beschreibung:**
```typescript
// Mit maxRetries=3: 1s + 2s + 3s = 6s
// Mit maxRetries=5: 1s + 2s + 3s + 4s + 5s = 15s
// Keine Obergrenze wie MAX_BACKOFF_MS
```

#### Problem 13: `runStream()` funktioniert nicht mit Tools
**Dateien:** `src/llm/agent.ts` (lines 271-282)
**Severität:** MITTEL
**Beschreibung:**
```typescript
async *runStream(userMessage: string, agentConfig: AgentConfig = {}): AsyncGenerator<string, void, unknown> {
  // ... setup ...
  const response = await this.run(userMessage, agentConfig); // Nutzt NON-STREAMING run()!
  yield response;
}

// Problem:
// - Streaming wird nicht genutzt
// - Gibt nur Final-Response
// - Tools werden NICHT streamed
// - "userMessage" wird zweimal verwendet (auch in run())
```

#### Problem 14: Keine Limits für Tool-Ausführungszeit
**Dateien:** `src/llm/agent.ts` (lines 212-213)
**Severität:** MITTEL
**Beschreibung:**
```typescript
const results = await this.toolManager.executeTools(assistantMessage.tool_calls);
// Kein Timeout! Wenn ein Tool hängt:
// - Gesamter Agent blockiert
// - Kein maxDuration-Parameter
// - Parent-Process kann nicht abbrechen
```

#### Problem 15: Verbose-Output könnte Secrets leaken
**Dateien:** `src/llm/agent.ts` (lines 189-240)
**Severität:** MITTEL
**Beschreibung:**
```typescript
if (verbose) {
  console.log(`[Tool Results:] ${result.result}`);
}

// Problem:
// - Keine Sanitization
// - Secrets in File-Paths/Inhalten sichtbar
// - Logs könnten in CI/CD landen
// - Z.B. API-Keys in Arguments
```

### 2.4 NIEDRIGE PRIORITÄT PROBLEME (P3)

#### Problem 16: Thinking-Message wird in Chat-History gespeichert
**Dateien:** `src/llm/agent.ts` (lines 171-177)
**Severität:** NIEDRIG
**Beschreibung:**
```typescript
if (assistantMessage.content) {
  const { thinking, cleanContent } = extractThinking(assistantMessage.content);
  if (thinking) {
    assistantMessage.thinking = thinking;  // Speichert als separate Property
    assistantMessage.content = cleanContent;
  }
}

// Nachbemerkung: Gutes Design, aber:
// - thinking wird NICHT über Netzwerk serialisiert
// - Wird nicht in Tool-Results persistiert
```

#### Problem 17: CallbackLoop speichert kompletten Result-String
**Dateien:** `src/llm/callback-loop.ts` (lines 187, 207)
**Severität:** NIEDRIG
**Beschreibung:**
```typescript
task.result = result; // Vollständiger String, potenziell MB groß
// Für große Projekte sind Task-Resultate später schwer zu handhaben
// Sollte nur Summary/Pointer speichern
```

#### Problem 18: ModelManager hat keine Caching für listModels()
**Dateien:** `src/llm/model-manager.ts` (lines 78-81)
**Severität:** NIEDRIG
**Beschreibung:**
```typescript
async initialize(): Promise<void> {
  const response = await this.client.listModels(); // Network-Call
  this.availableModels = response.models;
}

// Problem: Wird oft aufgerufen, aber Modelle ändern sich selten
// Sollte mit TTL gecacht werden (z.B. 5 Minuten)
```

---

## 3. PERFORMANCE-ISSUES

### 3.1 Kritische Performance-Probleme

#### Issue 1: Message History Wachstum (O(n) pro Iteration)
**Dateien:** `src/llm/agent.ts` (lines 184, 249)

**Metrik:**
```
Szenario: 50 Iterationen, 3 Tools pro Iteration
- Iteration 1: +2 Messages (assistant + 3 tool_results = 1 + 3)
- Iteration 2: +2 Messages
- ...
- Iteration 50: +2 Messages

Total: ~100 Messages * ~200 Tokens durchschnitt = 20.000 Tokens
Initial Context: 4.000 Tokens
Final: 24.000 Tokens

Mit 32K Context-Fenster: 75% gefüllt nach 50 Iterationen
```

**Lösung:** History-Compression nach N Iterationen

#### Issue 2: Retry-Mechanismus ist nicht optimal
**Dateien:** `src/llm/agent.ts` (lines 142-162)

**Analyse:**
```
Worst-Case: 3 Retries * 6 Sekunden Backoff = 18 Sekunden Wartezeit
- Für jeden fehlgeschlagenen API-Call

Mit 50 Iterations und Retry-Rate von 10%:
- 5 API-Calls würden fehlschlagen
- 5 * 18 Sekunden = 90 Sekunden nur Wartezeit!
```

**Problem:** Exponentieller Backoff ohne Jitter erzeugt Thundering Herd

#### Issue 3: Tool-Parsing ist O(n²)
**Dateien:** `src/llm/tool-format-parser.ts` (lines 18-57)

**Analyse:**
```typescript
// Zwei konkurrierende Regex-Gruppen:
const paramRegex = /<parameter[=\s]+([^>]+)>([^<]*)<\/parameter>/g;
const altParamRegex = /<parameter=([^>]+)>([^<]*)<\/parameter>/g;

// Problem: Beide werden ausgeführt, selbst wenn erste matches
// Bei 100 Parametern: ~200 Regex-Matches
// Für jeden Tool-Call in jedem Iteration
```

#### Issue 4: Tool-Ausführung ist sequenziell für Validierung
**Dateien:** `src/llm/agent.ts` (lines 212-213), `src/tools/tool-manager.ts` (lines 149-164)

**Analyse:**
```
Positiv: executeTools() ist parallel (Promise.all)

Aber Problem in agent.ts:
- Wartet auf ALL results: await this.toolManager.executeTools(...)
- Nur DANN liest Errors
- Liest Results sequenziell in console.log (lines 227-240)
- Schreibt Messages sequenziell (lines 243-250)

Impact: 1ms * 100 Messages = 100ms overhead pro Iteration
Mit 50 Iterationen = 5 Sekunden nur I/O
```

#### Issue 5: Thinking-Extraktion mit mehreren Regex-Tests
**Dateien:** `src/llm/agent.ts` (lines 19-41)

**Analyse:**
```typescript
for (const pattern of thinkingPatterns) {
  const match = content.match(pattern);
  if (match) {
    // ... extract ...
    break;
  }
}

// 5 Pattern-Tests gegen potenziell 10KB Response-Text
// Worst-Case: 5 * 10KB Regex-Matching
// Für jeden Response
```

### 3.2 Speicher-Probleme

#### Memory Issue 1: Sub-Agent schafft neue Agent-Instanzen pro Task
**Dateien:** `src/llm/sub-agent.ts` (lines 46)

```typescript
const subAgent = new Agent(this.config, this.toolManager, this.modelManager);
// Bei 50 parallel Tasks: 50 neue Agent-Instanzen
// Jede mit eigener conversationHistory

Memory Impact:
- Agent-Overhead: ~2KB je Instanz
- conversationHistory: 10KB+ je Instanz
- 50 * 12KB = 600KB nur für Sub-Agents
```

#### Memory Issue 2: CallbackLoop speichert vollständige Results
**Dateien:** `src/llm/callback-loop.ts` (lines 187)

```
Ein Result kann sein:
- 50KB für Dateiinhalt-Analyse
- 100+ Tools-Outputs
- Bei 100 Tasks: 5MB+ in Memory

Wenn viele parallel Tasks laufen: Speicher-Druck
```

---

## 4. VERBESSERUNGSVORSCHLÄGE MIT PRIORITÄT

### PRIORITÄT 1 - KRITISCH (blockiert Produktion)

#### 1.1 Message History Compression
**Problem:** Unbegrenztes Wachstum der Conversation History

**Lösung:**
```typescript
// In agent.ts nach jeder Iteration:

const MAX_HISTORY_SIZE = 40000; // tokens
const COMPRESS_THRESHOLD = 35000;

private compressHistory(): void {
  const historySize = this.estimateTokens(this.conversationHistory);

  if (historySize > COMPRESS_THRESHOLD) {
    // Behalte system + letzten 5 Iterationen
    const systemMsg = this.conversationHistory[0];
    const recentMsgs = this.conversationHistory.slice(-15); // ~5 Iterationen

    // Erstelle Zusammenfassung der alten Iterationen
    const summary = `[Previously executed: ${this.iteration - 5} iterations successfully, maintaining context for recent work]`;

    this.conversationHistory = [
      systemMsg,
      { role: 'user', content: summary },
      ...recentMsgs
    ];
  }
}

private estimateTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + (msg.content?.length ?? 0) / 4, 0);
}
```

**Impact:** Reduziert History-Overhead von 20K tokens auf ~8K

#### 1.2 Response Structure Validation
**Problem:** Keine Checks für Response-Struktur vor Zugriff

**Lösung:**
```typescript
// In agent.ts, neue Methode:

private validateAndExtractMessage(response: ChatCompletionResponse): Message {
  if (!response?.choices?.[0]?.message) {
    throw new Error(
      'Invalid API response structure: missing choices[0].message'
    );
  }

  const message = response.choices[0].message;

  if (!message.content && !message.tool_calls) {
    throw new Error(
      'Invalid message: neither content nor tool_calls present'
    );
  }

  return message;
}

// Dann in run():
let assistantMessage = this.validateAndExtractMessage(response);
```

**Impact:** Frühe Fehler-Erkennung, verhindert undefined-access

#### 1.3 Robust Tool Format Parsing
**Problem:** Zu viele False-Positives und Edge Cases

**Lösung:**
```typescript
// Neue Datei: src/llm/tool-parser-v2.ts

class ToolCallParser {
  private knownTools: Set<string>;

  constructor(knownToolNames: string[]) {
    this.knownTools = new Set(knownToolNames);
  }

  // Single regex mit klarem Format
  private readonly XML_PATTERN =
    /<function=([a-zA-Z_]\w*)\s*>([\s\S]*?)<\/function>/gi;

  parseXML(text: string): ToolCall[] {
    const calls: ToolCall[] = [];
    let match;

    while ((match = this.XML_PATTERN.exec(text)) !== null) {
      const funcName = match[1];

      // Validiere Tool-Name zuerst
      if (!this.knownTools.has(funcName)) continue;

      try {
        const params = this.parseParameters(match[2]);
        calls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: funcName,
            arguments: JSON.stringify(params)
          }
        });
      } catch (e) {
        console.warn(`Failed to parse tool call: ${funcName}`);
      }
    }

    return calls;
  }

  private parseParameters(paramBlock: string): Record<string, string> {
    const params: Record<string, string> = {};
    const paramPattern = /<parameter=([a-zA-Z_]\w*)>\s*([^<]*?)\s*<\/parameter>/gi;

    let match;
    while ((match = paramPattern.exec(paramBlock)) !== null) {
      params[match[1]] = match[2].trim();
    }

    return params;
  }
}
```

**Impact:** Verhindert False-Positives, bessere Error-Messages

#### 1.4 Add Timeout zu Tool Execution
**Problem:** Keine Limits für Tool-Ausführungszeit

**Lösung:**
```typescript
// In tool-manager.ts:

async executeTool(
  toolCall: ToolCall,
  timeoutMs: number = 30000  // 30 Sekunden Default
): Promise<any> {
  const tool = this.tools.get(toolCall.function.name);
  if (!tool) {
    throw new Error(`Tool not found: ${toolCall.function.name}`);
  }

  // Parse und Validierung
  let args: any;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    throw new Error(`Invalid tool arguments JSON: ${error}`);
  }

  const validatedArgs = tool.schema.parse(args);

  // Execute mit Timeout
  return Promise.race([
    tool.executor(validatedArgs),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tool execution timeout: ${toolCall.function.name} exceeded ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
}

// In agent.ts, run() Methode:
const results = await this.toolManager.executeTools(
  assistantMessage.tool_calls,
  this.config.toolTimeoutMs ?? 30000  // Konfigurierbar
);
```

**Impact:** Verhindert Agent-Blockieren bei langsamen Tools

---

### PRIORITÄT 2 - HOCH (verbessert Stabilität)

#### 2.1 Exponential Backoff mit Jitter
**Problem:** Deterministische Wartezeiten verursachen Thundering Herd

**Lösung:**
```typescript
// In agent.ts, neue Methode:

private calculateBackoffMs(retryCount: number): number {
  const baseMs = 1000;
  const maxMs = 30000; // 30 Sekunden Maximum

  // Exponential: 1s, 2s, 4s, 8s, 16s
  const exponential = Math.min(baseMs * Math.pow(2, retryCount - 1), maxMs);

  // Jitter: +/- 20%
  const jitter = exponential * (0.8 + Math.random() * 0.4);

  return Math.floor(jitter);
}

// Dann in Retry-Loop:
catch (error) {
  retryCount++;
  if (retryCount >= maxRetries) {
    throw error;
  }

  const backoffMs = this.calculateBackoffMs(retryCount);
  if (verbose) {
    console.log(`[Retry ${retryCount}/${maxRetries}] Waiting ${backoffMs}ms...`);
  }
  await new Promise(resolve => setTimeout(resolve, backoffMs));
}
```

**Impact:** Reduziert Peak-Load bei API-Fehlern

#### 2.2 Tool Call Logging für Debugging
**Problem:** Schwierig zu debuggen, welche Tool-Calls hängten

**Lösung:**
```typescript
// Neue Konfiguration in agent.ts:

interface AgentConfig {
  // ... existing ...
  toolCallLogging?: boolean;
  toolCallLogDir?: string;
}

// In run() Methode:
if (agentConfig.toolCallLogging) {
  const logDir = agentConfig.toolCallLogDir || './tool-call-logs';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = `${logDir}/iteration-${this.iteration}-${timestamp}.json`;

  await fs.writeFile(logPath, JSON.stringify({
    iteration: this.iteration,
    toolCalls: assistantMessage.tool_calls,
    executionResults: results,
    timestamp: Date.now()
  }, null, 2));
}
```

**Impact:** Besseres Debugging für Tool-Call-Fehler

#### 2.3 Sub-Agent Error Recovery
**Problem:** Sequential execution stoppt bei erstem Fehler ohne Kontext

**Lösung:**
```typescript
// In sub-agent.ts:

async executeSequential(
  tasks: SubAgentTask[],
  verbose: boolean = false,
  stopOnError: boolean = true  // Konfigurierbar
): Promise<SubAgentResult[]> {
  const results: SubAgentResult[] = [];
  let failedCount = 0;

  for (const task of tasks) {
    const result = await this.executeTask(task, verbose);
    results.push(result);

    if (!result.success) {
      failedCount++;

      if (verbose) {
        console.log(`[Sub-Agent] Task ${task.id} failed: ${result.error}`);
      }

      if (stopOnError) {
        // Report die bisherigen Ergebnisse
        console.log(`[Sub-Agent] Stopping after ${failedCount} failures`);
        break;
      }
    }
  }

  return results;
}
```

**Impact:** Besseres Error-Handling und Reporting

#### 2.4 Fix runStream() für Tool Support
**Problem:** Streaming-Funktion nutzt Non-Streaming run()

**Lösung:**
```typescript
async *runStream(
  userMessage: string,
  agentConfig: AgentConfig = {}
): AsyncGenerator<string, void, unknown> {
  const maxIterations = agentConfig.maxIterations || 50;
  const model = agentConfig.model || this.modelManager.selectModelForTask('code');

  if (agentConfig.systemPrompt) {
    this.setSystemPrompt(agentConfig.systemPrompt);
  }

  this.addUserMessage(userMessage);

  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // Streaming API Call
    let fullResponse = '';

    for await (const chunk of this.client.chatCompletionStream({
      model,
      messages: this.conversationHistory,
      tools: this.toolManager.getToolsForOllama(),
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    })) {
      if (chunk.choices?.[0]?.delta?.content) {
        fullResponse += chunk.choices[0].delta.content;
        yield chunk.choices[0].delta.content;
      }
    }

    // Rest der Logik wie in run()
    // ... tool_call handling, etc ...
  }
}
```

**Impact:** True Streaming für besseres UX

---

### PRIORITÄT 3 - MITTEL (verbessert Robustheit)

#### 3.1 CallbackLoop Race Condition Fix
**Problem:** Keine Locks bei concurrent Task-Updates

**Lösung:**
```typescript
// In callback-loop.ts:

private updateLock: Promise<void> = Promise.resolve();

private async executeTask(task: CallbackTask): Promise<void> {
  // Ensure sequential updates
  await this.updateLock;

  this.updateLock = (async () => {
    task.status = 'in_progress';
    task.updatedAt = Date.now();
    await this.save();

    try {
      // Execute task...
    } finally {
      task.updatedAt = Date.now();
      await this.save();
    }
  })();

  await this.updateLock;
}
```

**Impact:** Verhindert State-Corruption bei parallelen Updates

#### 3.2 Sub-Agent Model Fallback
**Problem:** Hardcoded Modelnamen, keine Fallback-Logik

**Lösung:**
```typescript
// In sub-agent.ts:

async executeTask(task: SubAgentTask, verbose: boolean = false): Promise<SubAgentResult> {
  const startTime = Date.now();

  try {
    const subAgent = new Agent(this.config, this.toolManager, this.modelManager);

    // Use configured model oder fallback zu best available
    let model = task.model;
    if (!model || !this.modelManager.isModelAvailable(model)) {
      model = this.modelManager.selectModelForTask('code');
      if (verbose) {
        console.log(`[Sub-Agent] Model ${task.model} not available, using ${model}`);
      }
    }

    const agentConfig: AgentConfig = {
      model,
      systemPrompt: task.systemPrompt,
      verbose,
      maxIterations: 5,
    };

    const result = await subAgent.run(task.description, agentConfig);

    return {
      id: task.id,
      success: true,
      result,
      duration: Date.now() - startTime
    };
  } catch (error) {
    // ... error handling
  }
}
```

**Impact:** Robuster gegen Model-Ausfälle

#### 3.3 Add Tool Error Context
**Problem:** Tool-Fehler sind schwer zu debuggen

**Lösung:**
```typescript
// In tool-manager.ts:

async executeTool(toolCall: ToolCall, timeoutMs: number = 30000): Promise<any> {
  const tool = this.tools.get(toolCall.function.name);
  if (!tool) {
    throw new Error(`Tool not found: ${toolCall.function.name}`);
  }

  let args: any;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    const err = new Error(
      `Invalid JSON in tool arguments: ${error instanceof Error ? error.message : String(error)}\n` +
      `Tool: ${toolCall.function.name}\n` +
      `Raw arguments: ${toolCall.function.arguments}`
    );
    throw err;
  }

  try {
    const validatedArgs = tool.schema.parse(args);
    return await Promise.race([
      tool.executor(validatedArgs),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool timeout: ${toolCall.function.name} (${timeoutMs}ms)`)),
          timeoutMs
        )
      )
    ]);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    err.message = `Tool execution failed: ${toolCall.function.name}\n${err.message}`;
    throw err;
  }
}
```

**Impact:** Bessere Error-Messages für Debugging

#### 3.4 ModelManager Caching
**Problem:** listModels() wird oft aufgerufen ohne Caching

**Lösung:**
```typescript
// In model-manager.ts:

export class ModelManager {
  private client: OllamaClient;
  private config: Config;
  private availableModels: OllamaModel[] = [];
  private lastModelsUpdate: number = 0;
  private modelsCacheTTL: number = 300000; // 5 Minuten

  constructor(config: Config, cacheTTLMs: number = 300000) {
    this.client = new OllamaClient(config.ollamaUrl);
    this.config = config;
    this.modelsCacheTTL = cacheTTLMs;
  }

  async initialize(): Promise<void> {
    await this.refreshModelsIfNeeded();
  }

  private async refreshModelsIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.lastModelsUpdate > this.modelsCacheTTL) {
      const response = await this.client.listModels();
      this.availableModels = response.models;
      this.lastModelsUpdate = now;
    }
  }

  getAvailableModels(): OllamaModel[] {
    return this.availableModels; // Cache wird verwendet
  }
}
```

**Impact:** Reduziert Network-Calls für Model-Info

---

### PRIORITÄT 4 - NIEDRIG (Nice-to-Have)

#### 4.1 Add Metrics/Tracing
```typescript
// Neue Klasse: src/llm/agent-metrics.ts

export interface IterationMetrics {
  iterationNum: number;
  historySize: number;
  toolCallCount: number;
  executionTime: number;
  apiCallDuration: number;
  toolExecutionDuration: number;
}

// In agent.ts:
private metrics: IterationMetrics[] = [];

// Collect metrics jede Iteration
```

#### 4.2 Add Verbose Mode Sanitization
```typescript
// In agent.ts:

private sanitizeForLogging(content: string): string {
  // Remove API-Keys, secrets, etc
  return content
    .replace(/api[_-]?key[:\s]*['"]*([^'"\s]+)/gi, 'API_KEY_REDACTED')
    .replace(/token[:\s]*['"]*([^'"\s]+)/gi, 'TOKEN_REDACTED')
    .replace(/password[:\s]*['"]*([^'"\s]+)/gi, 'PASSWORD_REDACTED');
}
```

#### 4.3 Thinking Storage
```typescript
// In agent.ts:

private thinkingHistory: Array<{ iteration: number; thinking: string }> = [];

// Store thinking from each iteration
if (assistantMessage.thinking) {
  this.thinkingHistory.push({
    iteration: this.iteration,
    thinking: assistantMessage.thinking
  });
}
```

---

## 5. IMPLEMENTIERUNGS-ROADMAP

### Phase 1 (SOFORT) - Kritische Fixes
1. Response Structure Validation (2-3 Stunden)
2. Message History Compression (4-5 Stunden)
3. Tool Timeout Implementation (2 Stunden)

**Geschätzter Aufwand:** 8-10 Stunden
**Impact:** Blockiert Crashes und Hangs verhindern

### Phase 2 (DIESE WOCHE) - Stabilität
1. Robust Tool Format Parser (4-5 Stunden)
2. Exponential Backoff mit Jitter (2 Stunden)
3. Tool Error Context Improvement (3 Stunden)

**Geschätzter Aufwand:** 9-10 Stunden
**Impact:** Robustheit gegen Edge Cases

### Phase 3 (NÄCHSTE WOCHE) - Features
1. Fix runStream() für Tools (4-5 Stunden)
2. Sub-Agent Model Fallback (3 Stunden)
3. CallbackLoop Race Condition (3 Stunden)

**Geschätzter Aufwand:** 10-11 Stunden
**Impact:** Feature-Vollständigkeit und Race-Conditions

### Phase 4 (SPÄTER) - Optimierungen
1. ModelManager Caching
2. Metrics/Tracing
3. Performance Profiling

---

## 6. TESTING-STRATEGIE

### Unit Tests
```
- Tool-Parser mit Edge Cases
- Message History Compression
- Backoff Calculation
- Model Fallback Logic
```

### Integration Tests
```
- Agent mit Tools über komplette Loop
- Sub-Agent Parallel/Sequential Execution
- CallbackLoop Task Processing
```

### Load Tests
```
- 50 Iterationen mit 5+ Tools
- Sub-Agent Parallel mit 20+ Tasks
- History Compression Trigger
- Memory Usage Monitoring
```

---

## ZUSAMMENFASSUNG

### Kritische Probleme (müssen behoben werden)
1. Memory Leak durch unbegrenzte Message History
2. Keine Response-Struktur Validierung
3. Fragiles Tool-Call Parsing
4. Fehlende Timeouts für Tool-Execution

### Performance-Bottlenecks
1. History-Wachstum (O(n) pro Iteration)
2. Sub-Agent Memory-Overhead
3. Thinking-Extraction mit mehreren Regex-Tests
4. Sequenzielles Message-Schreiben

### Verbesserungspotenzial
1. Robuste Error-Recovery
2. Bessere Logging/Debugging
3. Caching für Model-Info
4. True Streaming für runStream()

**Gesamte Löschungszeit (Phase 1+2):** ~19-20 Stunden
**Kritikalitätsfaktor:** HOCH - Diese Probleme blockieren Produktion bei längeren Runs
