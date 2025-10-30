# Error-Handling Audit - Detailed Analysis & Code Examples

## Quick Summary Table

| File | Issue Type | Severity | Lines | Issue |
|------|-----------|----------|-------|-------|
| cli.ts | No error handling | CRITICAL | 26-76 | REPL commands unhandled |
| agent.ts | Poor error context | CRITICAL | 142-166 | Retry loop doesn't preserve error context |
| ollama-client.ts | Silent stream failures | MEDIUM-HIGH | 73-93 | Malformed JSON chunks silently skipped |
| plugin-loader.ts | Silent failures | HIGH | 46-49, 64-66 | Plugin loading completely silent |
| config/index.ts | Silent fallback | MEDIUM | 31-35 | Invalid config merged silently |
| http-tool.ts | Inconsistent pattern | HIGH | 62-64, 96-98 | Returns errors instead of throwing |
| sqlite-tool.ts | Inconsistent pattern | HIGH | 63-65 | All errors returned as strings |
| tool-manager.ts | No validation handling | HIGH | 140 | Zod validation errors not caught |
| model-manager.ts | No error handling | HIGH | 78-81 | Model init can fail silently |
| bash.ts | Unsafe type handling | LOW-MEDIUM | 49-54 | Type casting for timeout check |
| file-ops.ts | No error differentiation | LOW-MEDIUM | 46-48, 96-98 | All file errors identical |
| callback-loop.ts | Weak error recovery | MEDIUM | 283-326 | Task queue error handling incomplete |

---

## File-by-File Error Analysis

### 1. `/home/core/dev/bricked-code/src/cli.ts`

**Problem Area:**
```typescript
// Lines 26-76: chat command action handler
.action(async (promptArgs: string[], options) => {
  // Health check has error handling
  const isHealthy = await client.healthCheck();
  if (!isHealthy) {
    console.error(chalk.red('Error: Cannot connect to Ollama server'));
    process.exit(1);
  }

  // BUT: These have no error handling!
  const repl = new EnhancedREPL({...});
  if (prompt) {
    await repl.executeSingleCommand(prompt);  // 🔴 UNHANDLED
  } else {
    await repl.start();  // 🔴 UNHANDLED
  }
})
```

**Issues:**
- REPL methods can throw - no try-catch
- Unhandled promise rejection at CLI top level
- User gets unformatted error stack trace
- Application crashes instead of graceful exit

**Similar Issue in 'models' command (lines 82-98):**
```typescript
try {
  const response = await client.listModels();
  // success path
} catch (error) {
  console.error(chalk.red('Error listing models:'), error);
  process.exit(1);
}
```
This DOES have error handling - shows the inconsistency.

**Fix Priority:** CRITICAL
**Recommended Fix:**
```typescript
.action(async (promptArgs: string[], options) => {
  try {
    const isHealthy = await client.healthCheck();
    if (!isHealthy) {
      console.error(chalk.red('Error: Cannot connect to Ollama server'));
      process.exit(1);
    }

    const repl = new EnhancedREPL({...});
    const prompt = promptArgs.join(' ').trim();

    if (prompt) {
      await repl.executeSingleCommand(prompt);
    } else {
      await repl.start();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error: ' + message));
    process.exit(1);
  }
})
```

---

### 2. `/home/core/dev/bricked-code/src/llm/agent.ts`

**Problem Area 1: Retry Logic (Lines 142-166)**
```typescript
while (retryCount < maxRetries) {
  try {
    response = await this.client.chatCompletion({
      model,
      messages: this.conversationHistory,
      tools: this.toolManager.getToolsForOllama(),
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });
    break; // Success
  } catch (error) {
    retryCount++;
    if (retryCount >= maxRetries) {
      throw error;  // 🔴 Original error thrown without context
    }
    if (verbose) {
      console.log(`[Retry ${retryCount}/${maxRetries}] API call failed, retrying...`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
  }
}

if (!response) {
  throw new Error('Failed to get response after retries');  // 🔴 Generic message
}
```

**Issues:**
- Original error is thrown without any context added
- Caller doesn't know:
  - How many times it retried
  - What the original error was
  - Whether it was temporary or permanent
- "Failed to get response after retries" message is misleading when response exists
- No differentiation between transient and permanent errors

**Problem Area 2: Tool Call Logging Error (Lines 192-206)**
```typescript
try {
  const args = JSON.parse(tc.function.arguments);
  // ... formatting ...
} catch (e) {
  console.log(`     Arguments: ${tc.function.arguments}`);  // 🟡 Silent failure
}
```
Silent catch - error logged to user but hidden, continue execution.

**Fix Priority:** CRITICAL
**Recommended Fix:**
```typescript
// Create custom error type
class RetryExhaustedError extends Error {
  constructor(
    public originalError: unknown,
    public attempts: number,
    message: string
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

// In retry loop:
while (retryCount < maxRetries) {
  try {
    response = await this.client.chatCompletion({...});
    break;
  } catch (error) {
    retryCount++;
    if (retryCount >= maxRetries) {
      throw new RetryExhaustedError(
        error,
        retryCount,
        `Failed to get chat completion after ${retryCount} attempts: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    // ... rest of retry logic ...
  }
}
```

---

### 3. `/home/core/dev/bricked-code/src/llm/ollama-client.ts`

**Problem Area: Stream Parsing (Lines 73-93)**
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
        console.error('Failed to parse chunk:', data);  // 🔴 SILENT FAILURE
        // Chunk is silently skipped - consumer never knows!
      }
    }
  }
} finally {
  reader.releaseLock();
}
```

**Issues:**
- Malformed JSON chunks silently skipped
- Consumer never notified about dropped data
- No way to detect data loss
- Could miss critical information
- Error logged to stderr but not propagated

**Multiple Failure Points:**
1. Line 61-64: Response body null check - throws but outer catch doesn't handle
2. Line 78: Decoder errors during decode() not caught
3. Line 89: JSON parse errors silently consumed

**Fix Priority:** MEDIUM-HIGH
**Recommended Fix:**
```typescript
// Use error accumulation
const errors: Array<{ chunk: string; error: unknown }> = [];

for (const line of lines) {
  const data = line.replace(/^data: /, '').trim();
  if (data === '[DONE]') continue;
  if (!data) continue;

  try {
    const parsed = JSON.parse(data);
    yield parsed;
  } catch (e) {
    errors.push({ chunk: data, error: e });
    if (verbose) {
      console.warn(`[Stream] Failed to parse chunk: ${data.substring(0, 100)}...`);
    }
    // Continue instead of throwing
  }
}

// Caller can check for errors
if (errors.length > 0 && !options.ignoreParseErrors) {
  throw new StreamParseError(
    `${errors.length} chunks failed to parse`,
    errors
  );
}
```

---

### 4. `/home/core/dev/bricked-code/src/plugins/plugin-loader.ts`

**Problem Area 1: Directory Loading (Lines 36-50)**
```typescript
private async loadPluginsFromDirectory(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = join(dir, entry.name);
        await this.loadPlugin(pluginPath);
      }
    }
  } catch (error) {
    console.warn(`Cannot load plugins from ${dir}:`, error);  // 🟡 Warning only
    // Silently continues - user might think plugins loaded!
  }
}
```

**Problem Area 2: Single Plugin Loading (Lines 55-66)**
```typescript
private async loadPlugin(pluginPath: string): Promise<void> {
  try {
    const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest: PluginManifest = JSON.parse(manifestContent);

    this.loadedPlugins.set(manifest.name, manifest);
    console.log(`Loaded plugin: ${manifest.name} v${manifest.version}`);
  } catch (error) {
    // Not a valid plugin directory
    // 🔴 COMPLETELY SILENT - no logging at all!
  }
}
```

**Issues:**
- Directory errors only warn to console
- Individual plugin errors completely silent
- User has no way to know plugins failed
- Debug will be extremely difficult
- Silent failures on:
  - Invalid manifest JSON
  - Missing manifest file
  - File read permissions
  - Any other FS error

**Fix Priority:** HIGH
**Recommended Fix:**
```typescript
private async loadPluginsFromDirectory(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = join(dir, entry.name);
        try {
          await this.loadPlugin(pluginPath);
        } catch (error) {
          // Log individual plugin failures
          console.warn(
            `Failed to load plugin from ${entry.name}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          // Continue with next plugin
        }
      }
    }
  } catch (error) {
    throw new Error(
      `Cannot load plugins from ${dir}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

private async loadPlugin(pluginPath: string): Promise<void> {
  const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json');
  const manifestContent = await fs.readFile(manifestPath, 'utf-8');

  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    throw new Error(
      `Invalid plugin manifest JSON at ${pluginPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  this.loadedPlugins.set(manifest.name, manifest);
  console.log(`Loaded plugin: ${manifest.name} v${manifest.version}`);
}
```

---

### 5. `/home/core/dev/bricked-code/src/config/index.ts`

**Problem Area: Config Loading (Lines 26-38)**
```typescript
async load(): Promise<Config> {
  try {
    const content = await fs.readFile(this.configPath, 'utf-8');
    const fileConfig = JSON.parse(content);  // 🟡 No JSON error handling
    this.config = { ...DEFAULT_CONFIG, ...fileConfig };
  } catch (error) {
    // Config file doesn't exist or is invalid, use defaults
    if ((error as any).code !== 'ENOENT') {
      console.warn('Failed to load config, using defaults:', error);
    }
    // 🔴 Silently uses defaults for ANY error
  }
  return this.config;
}
```

**Issues:**
- Only differentiates on ENOENT (file not found)
- Treats JSON parse errors the same as missing files
- User never knows config was corrupted
- No validation of config values
- Invalid values merged into defaults

**Error Types Not Distinguished:**
- ENOENT: File doesn't exist (OK to ignore)
- EACCES: Permission denied (should be reported)
- EISDIR: Path is a directory (should be reported)
- JSON.parse: Corrupted file (should warn user!)
- Other FS errors (should be reported)

**Scenario: User's config corrupted**
```javascript
// ~/.ollama-code/config.json - corrupted
{
  "ollamaUrl": "http://localhost:11434",
  "defaultModel": "qwen3-coder:30b"
  // Missing closing brace - corrupted!
}

// What happens:
// JSON.parse throws SyntaxError
// catch block ignores it (not ENOENT)
// User doesn't know config was ignored
// User wonders why custom settings aren't applied
```

**Fix Priority:** MEDIUM
**Recommended Fix:**
```typescript
async load(): Promise<Config> {
  try {
    const content = await fs.readFile(this.configPath, 'utf-8');
    let fileConfig: any;

    try {
      fileConfig = JSON.parse(content);
    } catch (parseError) {
      const message = `Config file is corrupted (invalid JSON): ${
        parseError instanceof Error ? parseError.message : String(parseError)
      }`;
      console.warn(message);
      console.warn('Using default configuration instead');
      return this.config;
    }

    // Validate config structure
    if (typeof fileConfig !== 'object' || fileConfig === null) {
      console.warn('Config file is invalid (not an object), using defaults');
      return this.config;
    }

    this.config = { ...DEFAULT_CONFIG, ...fileConfig };
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      // File doesn't exist - normal case
      return this.config;
    }

    // Other errors should be reported
    console.warn(
      `Failed to load config from ${this.configPath}: ${
        error instanceof Error ? error.message : String(error)
      }. Using defaults.`
    );
  }

  return this.config;
}
```

---

### 6. `/home/core/dev/bricked-code/src/tools/http-tool.ts` vs file-ops.ts

**Inconsistency Pattern:**

HTTP Tool returns errors as strings:
```typescript
// http-tool.ts line 62-64
catch (error) {
  return `HTTP Error: ${error instanceof Error ? error.message : String(error)}`;
}

// http-tool.ts line 96-98
catch (error) {
  return `Download Error: ${error instanceof Error ? error.message : String(error)}`;
}
```

File Operations throws errors:
```typescript
// file-ops.ts line 46-48
catch (error) {
  throw new Error(`Failed to read file ${args.file_path}: ${error}`);
}

// file-ops.ts line 96-98
catch (error) {
  throw new Error(`Failed to edit file ${args.file_path}: ${error}`);
}
```

SQLite Tool returns errors as strings:
```typescript
// sqlite-tool.ts line 63-65
catch (error) {
  return `SQL Error: ${error instanceof Error ? error.message : String(error)}`;
}
```

**Problem:**
- No consistency in error handling strategy
- Some tools expect error in result.error field
- Others expect errors thrown
- Makes error handling in calling code impossible to standardize

**Tool Result Structure Expectation:**
```typescript
// In tool-manager.ts executeTools() - lines 149-164
const results = Promise.all(
  toolCalls.map(async (call) => {
    try {
      const result = await this.executeTool(call);
      return { id: call.id, result };  // Assumes success
    } catch (error) {
      return {
        id: call.id,
        result: null,
        error: error instanceof Error ? error.message : String(error),  // Assumes thrown
      };
    }
  })
);
```

This expects errors to be THROWN, but HTTP/SQLite tools return error strings!

**Fix Priority:** HIGH
**Recommended Fix:** Standardize to throw errors:
```typescript
// All tools should throw, not return error strings
async function makeHttpRequest(args: HttpRequestArgs): Promise<string> {
  try {
    // ... execution ...
    return JSON.stringify(result, null, 2);
  } catch (error) {
    throw new ToolExecutionError(
      'http_request',
      error,
      `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
```

---

### 7. `/home/core/dev/bricked-code/src/tools/tool-manager.ts`

**Problem Area: Missing Zod Validation Error Handling (Line 140)**
```typescript
async executeTool(toolCall: ToolCall): Promise<any> {
  const tool = this.tools.get(toolCall.function.name);
  if (!tool) {
    throw new Error(`Tool not found: ${toolCall.function.name}`);
  }

  let args: any;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    throw new Error(`Invalid tool arguments JSON: ${error}`);
  }

  // 🔴 NO TRY-CATCH HERE!
  const validatedArgs = tool.schema.parse(args);  // Can throw Zod error

  // Execute the tool
  return await tool.executor(validatedArgs);
}
```

**Issues:**
- Zod validation errors not caught
- User sees cryptic Zod error message like:
  ```
  ZodError: [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["file_path"],
      "message": "Required"
    }
  ]
  ```
- No attempt to provide helpful error message
- No indication about what argument was invalid

**Fix Priority:** HIGH
**Recommended Fix:**
```typescript
async executeTool(toolCall: ToolCall): Promise<any> {
  const tool = this.tools.get(toolCall.function.name);
  if (!tool) {
    throw new Error(`Tool not found: ${toolCall.function.name}`);
  }

  let args: any;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    throw new Error(`Invalid tool arguments JSON: ${error}`);
  }

  // Validate with error handling
  const validation = tool.schema.safeParse(args);  // Use safeParse
  if (!validation.success) {
    const errors = validation.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new Error(
      `Invalid arguments for tool '${tool.name}': ${errors}`
    );
  }

  // Execute the tool
  return await tool.executor(validation.data);
}
```

---

### 8. `/home/core/dev/bricked-code/src/llm/model-manager.ts`

**Problem Area: No Error Handling in Initialize (Lines 78-81)**
```typescript
async initialize(): Promise<void> {
  const response = await this.client.listModels();  // 🔴 NO ERROR HANDLING
  this.availableModels = response.models;
}
```

**Where It's Called (from repl-enhanced.ts):**
```typescript
// Line 99-101 in repl-enhanced.ts
async initialize(): Promise<void> {
  await this.configManager.load();
  // ...
  await this.modelManager.initialize();  // 🔴 Can throw uncaught
}
```

**Issue:**
- If Ollama is unreachable, `listModels()` throws
- No recovery mechanism
- REPL initialization fails
- User gets cryptic error

**listModels() Can Throw:**
```typescript
// From ollama-client.ts lines 17-23
async listModels(): Promise<OllamaListResponse> {
  const response = await fetch(`${this.baseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.statusText}`);
  }
  return response.json() as Promise<OllamaListResponse>;
}
```

**Fix Priority:** HIGH
**Recommended Fix:**
```typescript
async initialize(): Promise<void> {
  try {
    const response = await this.client.listModels();
    this.availableModels = response.models;

    if (this.availableModels.length === 0) {
      console.warn('No models found in Ollama. Have you pulled any models?');
      console.warn('Try: ollama pull qwen3-coder:30b');
    }
  } catch (error) {
    console.error(
      'Failed to initialize models from Ollama:',
      error instanceof Error ? error.message : String(error)
    );
    console.error('Available models will be empty');
    // Continue but with empty models list
    this.availableModels = [];
  }
}

selectModelForTask(taskType: 'code' | 'reasoning' | 'general' = 'code'): string {
  // ... existing logic ...

  // Last resort: use first available model
  const first = this.availableModels[0];
  if (first) return first.name;

  // 🔴 THIS IS REACHED IF NO MODELS AT ALL
  throw new Error(
    'No Ollama models available. Please ensure Ollama is running and models are pulled.'
  );
}
```

---

## Summary Table of All Issues

| Issue | File | Lines | Severity | Type |
|-------|------|-------|----------|------|
| No try-catch on REPL commands | cli.ts | 26-76 | CRITICAL | Missing handler |
| Retry loop loses context | agent.ts | 142-166 | CRITICAL | Poor propagation |
| Stream silently drops chunks | ollama-client.ts | 73-93 | HIGH | Silent failure |
| Plugin loading silent | plugin-loader.ts | 46-49, 64-66 | HIGH | Silent failure |
| Config corruption ignored | config/index.ts | 31-35 | MEDIUM | Silent fallback |
| Inconsistent tool errors | http-tool.ts, sqlite-tool.ts | various | HIGH | Inconsistent pattern |
| Zod validation not caught | tool-manager.ts | 140 | HIGH | Missing handler |
| Model init unhandled | model-manager.ts | 78-81 | HIGH | Missing handler |
| File errors not differentiated | file-ops.ts | 46-48, 96-98 | LOW | Poor UX |
| Timeout check unsafe | bash.ts | 49-54 | LOW | Type safety |
| Tool execution unhandled | agent.ts | 213 | MEDIUM | Missing handler |
| Callback loop errors weak | callback-loop.ts | 283-326 | MEDIUM | Incomplete recovery |

