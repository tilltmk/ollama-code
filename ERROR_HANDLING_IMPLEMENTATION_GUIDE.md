# Error-Handling Implementation Guide

## Phase 1: Foundation (Critical Fixes)

### 1.1 Create Custom Error Types (`src/errors/index.ts`)

```typescript
/**
 * Custom Error Types for consistent error handling
 */

export class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly originalError: unknown,
    message: string,
    public readonly recoverable: boolean = false,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }

  static fromCatch(
    toolName: string,
    error: unknown,
    context?: Record<string, any>
  ): ToolExecutionError {
    const message = error instanceof Error ? error.message : String(error);
    return new ToolExecutionError(
      toolName,
      error,
      `${toolName} execution failed: ${message}`,
      false,
      context
    );
  }
}

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly value: any,
    message: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RetryExhaustedError extends Error {
  constructor(
    public readonly originalError: unknown,
    public readonly attempts: number,
    message: string
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

export class StreamParseError extends Error {
  constructor(
    message: string,
    public readonly errors: Array<{ chunk: string; error: unknown }>
  ) {
    super(message);
    this.name = 'StreamParseError';
  }
}

export class UserFacingError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly technicalMessage: string,
    public readonly suggestion?: string,
    public readonly errorCode?: string
  ) {
    super(userMessage);
    this.name = 'UserFacingError';
  }

  static fromError(
    error: unknown,
    userMessage: string,
    suggestion?: string
  ): UserFacingError {
    const tech = error instanceof Error ? error.message : String(error);
    return new UserFacingError(userMessage, tech, suggestion);
  }
}

export class ConfigError extends Error {
  constructor(
    public readonly configPath: string,
    message: string,
    public readonly isRecoverable: boolean = true
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}
```

### 1.2 Create Error Logger (`src/utils/error-logger.ts`)

```typescript
import chalk from 'chalk';

export interface ErrorLogContext {
  timestamp?: Date;
  tool?: string;
  layer?: string;
  userId?: string;
  context?: Record<string, any>;
}

export class ErrorLogger {
  private static isDevelopment = process.env.NODE_ENV !== 'production';

  static logError(
    message: string,
    error: unknown,
    logContext?: ErrorLogContext
  ): void {
    const errorData = {
      timestamp: logContext?.timestamp || new Date().toISOString(),
      tool: logContext?.tool,
      layer: logContext?.layer,
      message,
      error: {
        name: error?.constructor?.name,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      context: logContext?.context,
    };

    // Console output
    if (this.isDevelopment) {
      console.error(chalk.red('[ERROR]'), JSON.stringify(errorData, null, 2));
    } else {
      console.error(chalk.red('[ERROR]'), message);
    }

    // Could send to external service here
    // logToService(errorData);
  }

  static logWarning(
    message: string,
    context?: ErrorLogContext
  ): void {
    const data = {
      timestamp: context?.timestamp || new Date().toISOString(),
      message,
      context: context?.context,
    };

    console.warn(chalk.yellow('[WARN]'), JSON.stringify(data, null, 2));
  }

  static logInfo(
    message: string,
    context?: ErrorLogContext
  ): void {
    if (this.isDevelopment) {
      const data = {
        timestamp: context?.timestamp || new Date().toISOString(),
        message,
        context: context?.context,
      };

      console.log(chalk.blue('[INFO]'), JSON.stringify(data, null, 2));
    }
  }

  static logDebug(
    message: string,
    data?: any
  ): void {
    if (this.isDevelopment && process.env.DEBUG) {
      console.log(chalk.gray('[DEBUG]'), message, data || '');
    }
  }
}
```

---

## Phase 2: Critical Fixes

### 2.1 Fix CLI Entry Point (`src/cli.ts`)

**Before:**
```typescript
.action(async (promptArgs: string[], options) => {
  // ...
  const repl = new EnhancedREPL({...});
  if (prompt) {
    await repl.executeSingleCommand(prompt);  // ⚠️ UNHANDLED
  } else {
    await repl.start();  // ⚠️ UNHANDLED
  }
})
```

**After:**
```typescript
.action(async (promptArgs: string[], options) => {
  const ollamaUrl = options.url || process.env.OLLAMA_URL || 'http://localhost:11434';
  const client = new OllamaClient(ollamaUrl);

  try {
    const isHealthy = await client.healthCheck();
    if (!isHealthy) {
      console.error(chalk.red('Error: Cannot connect to Ollama server'));
      console.error(chalk.gray(`Tried: ${ollamaUrl}`));
      process.exit(1);
    }

    // ... config loading ...

    const repl = new EnhancedREPL({...});

    try {
      const prompt = promptArgs.join(' ').trim();
      if (prompt) {
        await repl.executeSingleCommand(prompt);
      } else {
        await repl.start();
      }
    } catch (error) {
      ErrorLogger.logError(
        'REPL execution failed',
        error,
        { layer: 'cli', context: { prompt: promptArgs.join(' ') } }
      );

      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${message}`));
      process.exit(1);
    }
  } catch (error) {
    ErrorLogger.logError('CLI initialization failed', error);
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Fatal Error: ${message}`));
    process.exit(1);
  }
})
```

### 2.2 Fix Agent Retry Logic (`src/llm/agent.ts`)

**Before:**
```typescript
while (retryCount < maxRetries) {
  try {
    response = await this.client.chatCompletion({...});
    break;
  } catch (error) {
    retryCount++;
    if (retryCount >= maxRetries) {
      throw error;  // ⚠️ Loses context
    }
    // ...
  }
}

if (!response) {
  throw new Error('Failed to get response after retries');  // ⚠️ Generic
}
```

**After:**
```typescript
let lastError: unknown;

while (retryCount < maxRetries) {
  try {
    response = await this.client.chatCompletion({
      model,
      messages: this.conversationHistory,
      tools: this.toolManager.getToolsForOllama(),
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });
    break;
  } catch (error) {
    lastError = error;
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

    if (verbose) {
      ErrorLogger.logWarning(
        `Retry ${retryCount}/${maxRetries} after chat completion failed`,
        {
          context: {
            attempt: retryCount,
            maxRetries,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      );
    }

    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
  }
}

if (!response) {
  throw new Error('Response object is null after successful API call');
}
```

### 2.3 Fix Plugin Loader (`src/plugins/plugin-loader.ts`)

**Before:**
```typescript
private async loadPluginsFromDirectory(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    // ...
  } catch (error) {
    console.warn(`Cannot load plugins from ${dir}:`, error);  // ⚠️ Only warns
  }
}

private async loadPlugin(pluginPath: string): Promise<void> {
  try {
    // ...
  } catch (error) {
    // ⚠️ COMPLETELY SILENT
  }
}
```

**After:**
```typescript
private failedPlugins: Array<{ path: string; error: string }> = [];

private async loadPluginsFromDirectory(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = join(dir, entry.name);
        try {
          await this.loadPlugin(pluginPath);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.failedPlugins.push({ path: entry.name, error: errorMsg });
          ErrorLogger.logWarning(`Failed to load plugin: ${entry.name}`, {
            context: { pluginPath, error: errorMsg }
          });
        }
      }
    }
  } catch (error) {
    ErrorLogger.logError(`Cannot read plugin directory ${dir}`, error);
    throw new Error(
      `Plugin directory unreadable: ${dir} - ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

private async loadPlugin(pluginPath: string): Promise<void> {
  const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json');

  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');

    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(manifestContent);
    } catch (parseError) {
      throw new Error(
        `Invalid plugin manifest JSON: ${
          parseError instanceof Error ? parseError.message : String(parseError)
        }`
      );
    }

    this.loadedPlugins.set(manifest.name, manifest);
    ErrorLogger.logInfo(`Loaded plugin: ${manifest.name} v${manifest.version}`);
  } catch (error) {
    throw new Error(
      `Failed to load plugin from ${pluginPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

getFailedPlugins(): Array<{ path: string; error: string }> {
  return this.failedPlugins;
}
```

---

## Phase 3: Tool Standardization

### 3.1 Standardize Tool Error Handling

**Pattern: All tools should THROW errors**

```typescript
// ✅ BEFORE (Inconsistent)
async function makeHttpRequest(args: HttpRequestArgs): Promise<string> {
  try {
    // ...
    return JSON.stringify(result);
  } catch (error) {
    return `HTTP Error: ${error.message}`;  // ⚠️ Returns error string
  }
}

// ✅ AFTER (Consistent)
async function makeHttpRequest(args: HttpRequestArgs): Promise<string> {
  try {
    // ... execution ...
    return JSON.stringify(result);
  } catch (error) {
    throw ToolExecutionError.fromCatch('http_request', error, {
      url: args.url,
      method: args.method,
    });
  }
}
```

**Apply to all tools:**
- `http-tool.ts` - makeHttpRequest, downloadFile
- `sqlite-tool.ts` - executeSqlQuery, createTable, etc.
- `bash.ts` - already mostly correct
- `file-ops.ts` - already mostly correct

---

## Phase 4: Validation Error Handling

### 4.1 Fix Tool Manager Zod Validation (`src/tools/tool-manager.ts`)

**Before:**
```typescript
const validatedArgs = tool.schema.parse(args);  // ⚠️ Can throw Zod error
```

**After:**
```typescript
const validation = tool.schema.safeParse(args);

if (!validation.success) {
  const errors = validation.error.errors
    .map(e => {
      const path = e.path.length > 0 ? e.path.join('.') : 'root';
      return `${path}: ${e.message}`;
    })
    .join('; ');

  throw new ValidationError(
    tool.name,
    args,
    `Invalid arguments for tool '${tool.name}': ${errors}`
  );
}

return await tool.executor(validation.data);
```

---

## Phase 5: Stream Error Handling

### 5.1 Fix Ollama Client Streaming (`src/llm/ollama-client.ts`)

**Before:**
```typescript
try {
  const parsed = JSON.parse(data);
  yield parsed;
} catch (e) {
  console.error('Failed to parse chunk:', data);  // ⚠️ Silent skip
}
```

**After:**
```typescript
const parseErrors: Array<{ chunk: string; error: unknown }> = [];

// ... in stream parsing loop ...

try {
  const parsed = JSON.parse(data);
  yield parsed;
} catch (e) {
  parseErrors.push({ chunk: data.substring(0, 100), error: e });
  if (request.verbose) {
    ErrorLogger.logWarning('Failed to parse stream chunk', {
      context: { chunk: data.substring(0, 100) }
    });
  }
  // Continue instead of throwing
}

// After loop, check for errors
if (parseErrors.length > 0 && request.strictStreamParsing !== false) {
  throw new StreamParseError(
    `${parseErrors.length} chunks failed to parse in stream response`,
    parseErrors
  );
}
```

---

## Phase 6: Configuration Error Handling

### 6.1 Fix Config Manager (`src/config/index.ts`)

**Before:**
```typescript
async load(): Promise<Config> {
  try {
    const content = await fs.readFile(this.configPath, 'utf-8');
    const fileConfig = JSON.parse(content);
    this.config = { ...DEFAULT_CONFIG, ...fileConfig };
  } catch (error) {
    if ((error as any).code !== 'ENOENT') {
      console.warn('Failed to load config, using defaults:', error);
    }
  }
  return this.config;
}
```

**After:**
```typescript
async load(): Promise<Config> {
  try {
    const content = await fs.readFile(this.configPath, 'utf-8');

    let fileConfig: any;
    try {
      fileConfig = JSON.parse(content);
    } catch (parseError) {
      const message = `Config file is corrupted (invalid JSON) at ${this.configPath}`;
      ErrorLogger.logWarning(message, {
        context: {
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
        }
      });
      console.warn('Using default configuration instead');
      return this.config;
    }

    if (typeof fileConfig !== 'object' || fileConfig === null) {
      ErrorLogger.logWarning('Config file is invalid (not an object)', {
        context: { type: typeof fileConfig }
      });
      return this.config;
    }

    this.config = { ...DEFAULT_CONFIG, ...fileConfig };
  } catch (error) {
    const fsError = error as any;

    if (fsError.code === 'ENOENT') {
      // File doesn't exist - normal first run
      return this.config;
    }

    const message = `Failed to load config from ${this.configPath}: ${
      fsError.message || String(fsError)
    }`;

    ErrorLogger.logWarning(message, {
      context: {
        code: fsError.code,
        errno: fsError.errno,
      }
    });
  }

  return this.config;
}
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Create `src/errors/index.ts` with custom error types
- [ ] Create `src/utils/error-logger.ts` with ErrorLogger
- [ ] Update imports in all source files
- [ ] Update `package.json` type exports if needed

### Phase 2: Critical Fixes
- [ ] Fix CLI entry point with try-catch wrapper
- [ ] Fix Agent retry logic with context preservation
- [ ] Fix plugin loader with proper error reporting
- [ ] Test CLI error cases

### Phase 3: Tool Standardization
- [ ] Update `http-tool.ts` to throw instead of return
- [ ] Update `sqlite-tool.ts` to throw instead of return
- [ ] Verify all tools are consistent
- [ ] Update tool-manager.ts if needed for new patterns

### Phase 4: Validation
- [ ] Update `tool-manager.ts` to use safeParse
- [ ] Add ValidationError handling
- [ ] Test with invalid arguments

### Phase 5: Streaming
- [ ] Update `ollama-client.ts` stream parsing
- [ ] Add StreamParseError type
- [ ] Test with malformed responses

### Phase 6: Configuration
- [ ] Update `config/index.ts` with proper error handling
- [ ] Test with corrupted config
- [ ] Test with missing permissions

### Phase 7: Testing
- [ ] Write error handling tests for each module
- [ ] Test recovery paths
- [ ] Test user-facing error messages
- [ ] Integration tests for error propagation

### Phase 8: Documentation
- [ ] Update API documentation
- [ ] Document error types and codes
- [ ] Document recovery strategies
- [ ] Create error handling guide for contributors

---

## Testing Strategy

### Unit Tests
```typescript
// test/errors.test.ts
describe('ToolExecutionError', () => {
  it('should preserve original error', () => {
    const original = new Error('Test error');
    const tool = ToolExecutionError.fromCatch('test', original);
    expect(tool.originalError).toBe(original);
  });

  it('should format message correctly', () => {
    const error = new ToolExecutionError('test', new Error('Msg'), 'Prefix');
    expect(error.message).toContain('test');
  });
});
```

### Integration Tests
```typescript
// test/integration/error-propagation.test.ts
describe('Error Propagation', () => {
  it('should propagate HTTP errors through agent', async () => {
    // Mock HTTP failure
    // Run agent
    // Verify error is caught and logged
  });

  it('should handle tool validation errors gracefully', async () => {
    // Pass invalid args to tool
    // Verify ValidationError is thrown
    // Verify message is helpful
  });
});
```

