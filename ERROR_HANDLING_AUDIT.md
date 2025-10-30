# Error-Handling Audit Report
**Project:** bricked-code
**Date:** 2025-10-29
**Analyzed Files:** 22 TypeScript Source Files

---

## 1. ERROR-HANDLING OVERVIEW

### Current State
- **Total Try-Catch Blocks:** 18 files with error handling
- **Error Patterns:** Mix of throw, return errors, and silent failures
- **Error Propagation:** Inconsistent - some errors thrown, some caught and returned as strings
- **User-Facing Errors:** Primarily in CLI and Tool execution layers

### Error Handling Distribution
| Category | Count | Files |
|----------|-------|-------|
| Try-Catch blocks | ~15 | bash.ts, file-ops.ts, grep.ts, http-tool.ts, sqlite-tool.ts, etc. |
| Thrown Errors | ~20 | tool-manager.ts, agent.ts, ollama-client.ts, callback-loop.ts |
| Error Strings | ~3 | http-tool.ts, sqlite-tool.ts |
| Silent Failures | ~5 | plugin-loader.ts, config/index.ts, various catch blocks |
| Async/Await without handlers | Multiple | Throughout codebase |

---

## 2. KRITISCHE PROBLEME

### 2.1 Silent Failures in Plugin Loading
**File:** `/home/core/dev/bricked-code/src/plugins/plugin-loader.ts` (Lines 46-49, 64-66)

```typescript
catch (error) {
  // Directory doesn't exist or can't be read
  console.warn(`Cannot load plugins from ${dir}:`, error);
}
```

**Issue:**
- Silent failures in `loadPluginsFromDirectory()` - only warns to console
- Individual plugin loading failures (line 64-66) are completely silent (empty catch)
- No error propagation or reporting mechanism
- User unaware if plugins fail to load

**Risk Level:** HIGH
- Plugins silently fail to load without user notification
- No way to debug or understand plugin loading issues

---

### 2.2 Unhandled Promise Rejections in Agent Loop
**File:** `/home/core/dev/bricked-code/src/llm/agent.ts` (Lines 142-162)

```typescript
while (retryCount < maxRetries) {
  try {
    response = await this.client.chatCompletion({...});
    break;
  } catch (error) {
    retryCount++;
    if (retryCount >= maxRetries) {
      throw error; // Throws, but caller may not handle properly
    }
    // Exponential backoff
    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
  }
}
```

**Issue:**
- Retry logic throws error after max retries, but no context about what failed
- Error message "Failed to get response after retries" (line 165) doesn't include retry count or last error
- Tool execution can fail silently if error handling is not done in calling code

**Risk Level:** CRITICAL
- Agent loop can crash if error is not caught by caller
- Users don't know why agent stopped

---

### 2.3 Inconsistent Error Handling in Tool Executors
**File:** `/home/core/dev/bricked-code/src/tools/http-tool.ts` (Lines 62-64, 96-98)

```typescript
// makeHttpRequest returns error as string instead of throwing
catch (error) {
  return `HTTP Error: ${error instanceof Error ? error.message : String(error)}`;
}

// downloadFile also returns error as string
catch (error) {
  return `Download Error: ${error instanceof Error ? error.message : String(error)}`;
}
```

**Contrast with file-ops.ts:**
```typescript
// Throws errors instead of returning strings
catch (error) {
  throw new Error(`Failed to read file ${args.file_path}: ${error}`);
}
```

**Issue:**
- Some tools return errors as strings, others throw
- No consistent error handling strategy across tool layer
- Difficult to distinguish between successful "error results" and actual failures
- Tool result handling in agent.ts assumes error in separate `error` field

**Risk Level:** HIGH
- Inconsistent behavior causes bugs in error detection
- Tools reporting errors vs. throwing prevents proper error handling

---

### 2.4 Unsafe Error String Conversion
**File:** Multiple files (tool-manager.ts, bash.ts, agent.ts)

```typescript
// In tool-manager.ts line 159
error: error instanceof Error ? error.message : String(error),

// In bash.ts line 53
throw new Error(`Failed to execute command: ${error}`);

// In grep.ts line 109
throw new Error(`Failed to execute grep: ${error}`);
```

**Issue:**
- Converting unknown error types to strings loses important information
- Stack traces are lost
- Error instanceof checks may fail for certain error types
- String interpolation of errors can produce unclear messages

**Risk Level:** MEDIUM
- Difficult debugging
- Stack traces not preserved
- Error context lost

---

### 2.5 Config Loading with Silent Fallback
**File:** `/home/core/dev/bricked-code/src/config/index.ts` (Lines 31-35)

```typescript
async load(): Promise<Config> {
  try {
    const content = await fs.readFile(this.configPath, 'utf-8');
    const fileConfig = JSON.parse(content);
    this.config = { ...DEFAULT_CONFIG, ...fileConfig };
  } catch (error) {
    // Config file doesn't exist or is invalid, use defaults
    if ((error as any).code !== 'ENOENT') {
      console.warn('Failed to load config, using defaults:', error);
    }
  }
  return this.config;
}
```

**Issue:**
- Only warns for non-ENOENT errors
- Invalid JSON in config file silently uses defaults
- No indication to user that config was corrupted
- Merges potentially invalid config into defaults

**Risk Level:** MEDIUM
- Corrupted config silently falls back
- User never knows config settings were ignored

---

### 2.6 Uncaught Exceptions in Streaming
**File:** `/home/core/dev/bricked-code/src/llm/ollama-client.ts` (Lines 73-93)

```typescript
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

    for (const line of lines) {
      const data = line.replace(/^data: /, '').trim();
      if (data === '[DONE]') continue;
      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        yield parsed;
      } catch (e) {
        console.error('Failed to parse chunk:', data); // Silent failure!
      }
    }
  }
} finally {
  reader.releaseLock();
}
```

**Issue:**
- Inner try-catch silently logs error but continues
- Malformed JSON chunks are skipped without consumer knowing
- Outer error handling only catches up to reader initialization
- Decoder errors not handled

**Risk Level:** MEDIUM-HIGH
- Partial/corrupted responses silently consumed
- Consumer receives incomplete data
- No way for caller to detect dropped chunks

---

### 2.7 Database Errors Returned as Strings (Not Thrown)
**File:** `/home/core/dev/bricked-code/src/tools/sqlite-tool.ts` (Lines 63-65)

```typescript
async function executeSqlQuery(args: z.infer<typeof sqlQuerySchema>): Promise<string> {
  try {
    // ... execution logic ...
  } catch (error) {
    return `SQL Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}
```

**Issue:**
- All database errors returned as string instead of thrown
- Consumer cannot distinguish between error and empty result
- Different from standard async/await error handling
- Difficult to implement proper error recovery in caller

**Risk Level:** MEDIUM
- Inconsistent error handling
- Cannot use standard try-catch around database operations
- Makes error recovery difficult

---

## 3. FEHLENDE ERROR-HANDLING

### 3.1 No Error Handling in CLI Entry Point
**File:** `/home/core/dev/bricked-code/src/cli.ts`

```typescript
.action(async (promptArgs: string[], options) => {
  // ... health check ...
  const repl = new EnhancedREPL({...});

  // executeSingleCommand and start() not wrapped in try-catch
  if (prompt) {
    await repl.executeSingleCommand(prompt);  // ⚠️ NO ERROR HANDLING
  } else {
    await repl.start();  // ⚠️ NO ERROR HANDLING
  }
})
```

**Issue:**
- No error handling at CLI entry point
- REPL errors bubble up uncaught
- No graceful error messages to user
- Application crashes instead of handling errors

**Risk Level:** CRITICAL
- Crashes without message
- Poor user experience
- Unhandled promise rejections

---

### 3.2 No Validation Error Handling for Zod Schemas
**File:** `/home/core/dev/bricked-code/src/tools/tool-manager.ts` (Line 140)

```typescript
// No try-catch around schema validation
const validatedArgs = tool.schema.parse(args);
```

**Issue:**
- Zod validation errors not caught
- Invalid arguments crash tool execution
- User sees cryptic Zod error instead of helpful message
- No validation result checking

**Risk Level:** HIGH
- Schema validation errors not user-friendly
- Tool execution crashes on invalid input
- No graceful error handling for bad parameters

---

### 3.3 Missing Error Handling in Model Manager
**File:** `/home/core/dev/bricked-code/src/llm/model-manager.ts` (Lines 78-81)

```typescript
async initialize(): Promise<void> {
  const response = await this.client.listModels();  // ⚠️ NO ERROR HANDLING
  this.availableModels = response.models;
}
```

**Issue:**
- No try-catch around model initialization
- Ollama connection failures crash silently
- No fallback if Ollama is unreachable during initialization
- Agent creation fails with unclear error

**Risk Level:** HIGH
- Silent failure if Ollama unavailable
- No user feedback about connection issue
- Cascading failure to Agent

---

### 3.4 No Error Handling in Tool Execution Loop
**File:** `/home/core/dev/bricked-code/src/llm/agent.ts` (Lines 213)

```typescript
// Execute all tool calls with retry logic
const results = await this.toolManager.executeTools(assistantMessage.tool_calls);
// ⚠️ THIS CAN THROW - NO ERROR HANDLING
```

**Issue:**
- `executeTools()` can throw
- If tool execution fails, entire agent loop crashes
- No fallback mechanism
- User doesn't get any results

**Risk Level:** MEDIUM-HIGH
- Unhandled rejection in tool execution
- Agent stops without explanation
- No partial results returned

---

### 3.5 No Error Recovery in Callback Loop
**File:** `/home/core/dev/bricked-code/src/llm/callback-loop.ts` (Lines 283-326)

```typescript
async run(initialTask?: string): Promise<string> {
  // ...
  while (this.iteration < this.maxIterations) {
    const task = this.getNextTask();
    if (!task) {
      // ...
    }

    await this.executeTask(task);  // ⚠️ Errors caught in executeTask, but...
    // What if executeTask itself throws an uncaught error?
  }
}
```

**Issue:**
- `executeTask()` has its own try-catch, but doesn't guarantee all errors are caught
- Queue system has no global error handler
- If save() fails, loop continues silently
- No way to pause on critical errors

**Risk Level:** MEDIUM
- Task queue may become corrupted
- Errors in task execution not fully contained
- No critical error notification

---

### 3.6 No File System Error Differentiation
**File:** `/home/core/dev/bricked-code/src/tools/file-ops.ts` (Lines 46-48, 96-98)

```typescript
async function readFile(args: z.infer<typeof readFileSchema>): Promise<string> {
  try {
    const content = await fs.readFile(args.file_path, 'utf-8');
    // ...
  } catch (error) {
    // Treats all errors the same: ENOENT, EACCES, EISDIR, etc.
    throw new Error(`Failed to read file ${args.file_path}: ${error}`);
  }
}
```

**Issue:**
- All file errors treated identically
- No distinction between "file not found" vs "permission denied" vs "not a file"
- User gets generic error message
- No context for error recovery

**Risk Level:** LOW-MEDIUM
- Poor error messages
- Cannot provide specific recovery guidance
- User confusion about root cause

---

### 3.7 No Timeout Error Handling
**File:** `/home/core/dev/bricked-code/src/tools/bash.ts` (Lines 49-54)

```typescript
catch (error) {
  if ((error as any).timedOut) {
    return `Command timed out after ${args.timeout || 120000}ms`;
  }
  throw new Error(`Failed to execute command: ${error}`);
}
```

**Issue:**
- Timeout checking uses unsafe property access `(error as any).timedOut`
- Throws error for any non-timeout failure
- No distinction between timeout and other errors in throw
- HTTP timeout not handled in http-tool.ts

**Risk Level:** LOW
- Type safety issue
- Could mask timeout vs. actual failures

---

## 4. BEST-PRACTICE VERBESSERUNGEN

### 4.1 Error Standardization Strategy
**Current State:** Inconsistent error handling

```typescript
// ❌ INCONSISTENT: Some return errors, some throw

// http-tool.ts returns error strings
return `HTTP Error: ${error.message}`;

// file-ops.ts throws errors
throw new Error(`Failed to read file: ${error}`);

// sqlite-tool.ts returns error strings
return `SQL Error: ${error.message}`;
```

**Recommendation:** Implement standard error handling:

```typescript
// ✅ CONSISTENT: Create custom error types

export class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly originalError: unknown,
    message: string,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

// All tools follow same pattern
async function executeCommand(args: CommandArgs): Promise<string> {
  try {
    // ... execution ...
  } catch (error) {
    throw new ToolExecutionError(
      'bash',
      error,
      `Command execution failed: ${error instanceof Error ? error.message : String(error)}`,
      isRecoverable(error)
    );
  }
}
```

**Benefits:**
- Consistent error handling across all tools
- Recoverable errors can be retried
- Stack traces preserved
- Proper error categorization

---

### 4.2 Error Propagation with Context
**Current State:** Errors lose context through layers

```typescript
// ❌ Context lost through conversions
async function createAgent() {
  try {
    await modelManager.initialize();  // Error lost here
  } catch (error) {
    console.error('Model init failed:', error.message); // Generic message
  }
}
```

**Recommendation:** Add context wrapping:

```typescript
// ✅ Error context preserved
class ErrorContext {
  constructor(
    private layers: Array<{ layer: string; timestamp: number }> = []
  ) {}

  addLayer(layer: string): ErrorContext {
    return new ErrorContext([...this.layers, { layer, timestamp: Date.now() }]);
  }

  toString(): string {
    return this.layers.map(l => l.layer).join(' -> ');
  }
}

async function createAgent() {
  try {
    try {
      await modelManager.initialize();
    } catch (error) {
      throw new ToolExecutionError(
        'model-manager',
        error,
        'Failed to initialize model manager during agent creation'
      );
    }
  } catch (error) {
    console.error('Agent creation failed:', error.message);
  }
}
```

---

### 4.3 Structured Error Logging
**Current State:** Inconsistent logging

```typescript
// ❌ Inconsistent: Some use console.warn, some console.error, some silent
console.warn('Failed to load config', error);        // cli
console.error('Failed to parse chunk:', data);       // ollama-client
// ... silent failures ...
```

**Recommendation:** Implement structured logging:

```typescript
// ✅ Structured error logging
export class ErrorLogger {
  static logToolError(
    toolName: string,
    error: unknown,
    context?: Record<string, any>
  ): void {
    const errorData = {
      timestamp: new Date().toISOString(),
      tool: toolName,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        type: error?.constructor?.name,
      },
      context,
      severity: 'error',
    };

    console.error('[ERROR]', JSON.stringify(errorData, null, 2));

    // Could also send to logging service
    // logToService(errorData);
  }

  static logWarning(message: string, context?: Record<string, any>): void {
    const data = {
      timestamp: new Date().toISOString(),
      message,
      context,
      severity: 'warning',
    };
    console.warn('[WARNING]', JSON.stringify(data, null, 2));
  }
}

// Usage:
try {
  await fs.readFile(path);
} catch (error) {
  ErrorLogger.logToolError('read_file', error, { path });
  throw error;
}
```

---

### 4.4 Graceful Degradation Pattern
**Current State:** Agent stops on first error

```typescript
// ❌ No fallback
while (iterations < maxIterations) {
  const response = await this.client.chatCompletion({...});
  // If this throws, loop stops
}
```

**Recommendation:** Implement fallback logic:

```typescript
// ✅ Graceful degradation
async function getChatResponse(): Promise<ChatCompletionResponse | null> {
  // Try with preferred model first
  try {
    return await this.client.chatCompletion({
      model: this.modelManager.selectModelForTask('code'),
      // ...
    });
  } catch (error) {
    ErrorLogger.logWarning('Primary model failed, attempting fallback');

    // Try with fallback model
    try {
      return await this.client.chatCompletion({
        model: this.modelManager.selectModelForTask('general'),
        // ...
      });
    } catch (fallbackError) {
      ErrorLogger.logToolError('chat-completion', fallbackError, {
        primaryFailed: true,
        fallbackFailed: true,
      });
      return null; // Return null instead of crashing
    }
  }
}

// In agent loop:
const response = await getChatResponse();
if (!response) {
  // Graceful exit or retry with partial results
  return 'Unable to reach language model. Partial results: ' + partialOutput;
}
```

---

### 4.5 User-Facing Error Messages
**Current State:** Technical errors shown to users

```typescript
// ❌ User sees: "Failed to execute command: Error: spawn bash ENOENT"
throw new Error(`Failed to execute command: ${error}`);
```

**Recommendation:** Implement error message translation:

```typescript
// ✅ User-friendly error messages
export class UserFacingError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly technicalMessage: string,
    public readonly suggestion?: string,
    public readonly code?: string
  ) {
    super(userMessage);
    this.name = 'UserFacingError';
  }
}

const ERROR_MESSAGES: Record<string, UserFacingError> = {
  'bash_not_found': new UserFacingError(
    'Could not execute command.',
    'bash executable not found in PATH',
    'Check that bash is installed and in your PATH',
    'BASH_NOT_FOUND'
  ),
  'file_not_found': new UserFacingError(
    'File not found.',
    'ENOENT: no such file or directory',
    'Check the file path and ensure the file exists',
    'FILE_NOT_FOUND'
  ),
  'permission_denied': new UserFacingError(
    'Permission denied.',
    'EACCES: permission denied',
    'Check file permissions and try with appropriate access',
    'PERMISSION_DENIED'
  ),
};

// Usage:
try {
  await executeCommand(cmd);
} catch (error) {
  if ((error as any).code === 'ENOENT') {
    throw ERROR_MESSAGES['bash_not_found'];
  }
  // ... handle other codes ...
}

// In CLI or UI:
try {
  await agent.run(userPrompt);
} catch (error) {
  if (error instanceof UserFacingError) {
    console.error(chalk.red(error.userMessage));
    if (options.verbose) {
      console.error(chalk.gray(error.technicalMessage));
    }
    if (error.suggestion) {
      console.log(chalk.blue('Suggestion: ' + error.suggestion));
    }
  }
}
```

---

### 4.6 Error Recovery Strategies
**Current State:** No recovery on errors

```typescript
// ❌ No recovery options
const results = await this.toolManager.executeTools(toolCalls);
// If this fails, agent stops
```

**Recommendation:** Implement retry strategies:

```typescript
// ✅ Configurable retry logic
export interface RetryConfig {
  maxAttempts: number;
  backoffMultiplier: number;
  initialDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
}

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: unknown;
  let delay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if should retry
      if (config.shouldRetry && !config.shouldRetry(error)) {
        throw error;
      }

      if (attempt < config.maxAttempts) {
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }
  }

  throw new Error(`Failed after ${config.maxAttempts} attempts: ${lastError}`);
}

// Usage:
const results = await executeWithRetry(
  () => this.toolManager.executeTools(toolCalls),
  {
    maxAttempts: 3,
    backoffMultiplier: 2,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    shouldRetry: (error) => {
      // Don't retry validation errors
      return !(error instanceof ValidationError);
    }
  }
);
```

---

### 4.7 Error Boundaries for Components
**Current State:** Errors cascade uncaught

```typescript
// ❌ Errors in REPL crash entire application
await repl.start();
```

**Recommendation:** Implement error boundaries:

```typescript
// ✅ Error boundary wrapper
export class ErrorBoundary {
  constructor(private name: string, private onError?: (error: Error) => void) {}

  async wrap<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[${this.name}] Error boundary caught:`, err.message);

      if (this.onError) {
        this.onError(err);
      }

      return null;
    }
  }

  syncWrap<T>(fn: () => T): T | null {
    try {
      return fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[${this.name}] Error boundary caught:`, err.message);

      if (this.onError) {
        this.onError(err);
      }

      return null;
    }
  }
}

// Usage:
const replBoundary = new ErrorBoundary('EnhancedREPL', (error) => {
  console.error('REPL encountered an error');
  // Could attempt recovery, logging, etc.
});

async function runREPL() {
  const result = await replBoundary.wrap(() => repl.start());
  if (result === null) {
    console.error('REPL failed to start');
    process.exit(1);
  }
}
```

---

## 5. ZUSAMMENFASSUNG UND PRIORISIERUNG

### Kritische Probleme (Sofort beheben)
1. **Agent Loop Error Propagation** - Can crash entire application
2. **CLI Entry Point Error Handling** - No graceful error exit
3. **Model Manager Initialization** - Silent failures on Ollama disconnect
4. **Tool Zod Validation** - Schema errors not handled

### Hohe Priorität (Diese Woche)
1. **Inconsistent Tool Error Handling** - Some throw, some return strings
2. **Streaming Error Handling** - Silent chunk drops
3. **Plugin System Silent Failures** - No error reporting
4. **Config Loading Fallbacks** - Corrupted config ignored silently

### Mittlere Priorität (Dieses Sprint)
1. **Error String Conversion** - Loss of stack traces
2. **File System Error Differentiation** - Generic error messages
3. **Database Error Handling** - Errors returned as strings instead of thrown
4. **Callback Loop Error Recovery** - No global error handler

### Empfohlener Action Plan
1. Create centralized error types and custom Error classes
2. Implement consistent try-catch strategy across all tools
3. Add error boundaries to REPL and CLI entry points
4. Implement user-facing error message system
5. Add structured error logging
6. Implement graceful degradation patterns
7. Add retry logic with exponential backoff for transient failures
8. Differentiate between recoverable and non-recoverable errors

