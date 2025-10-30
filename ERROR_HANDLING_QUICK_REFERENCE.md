# Error-Handling Quick Reference

## Critical Problems at a Glance

```
🔴 CRITICAL (Fix immediately)
├─ cli.ts: REPL commands unhandled (lines 26-76)
├─ agent.ts: Retry loop loses error context (lines 142-166)
├─ model-manager.ts: Model init crashes silently (lines 78-81)
└─ tool-manager.ts: Zod validation not caught (line 140)

🟠 HIGH (Fix this week)
├─ http-tool.ts: Returns errors instead of throwing (lines 62-64, 96-98)
├─ sqlite-tool.ts: All errors returned as strings (line 63-65)
├─ plugin-loader.ts: Plugin failures silent (lines 46-49, 64-66)
├─ config/index.ts: Invalid config ignored (lines 31-35)
└─ ollama-client.ts: Stream chunks silently dropped (lines 73-93)

🟡 MEDIUM (Fix this sprint)
├─ agent.ts: Tool execution unhandled (line 213)
├─ callback-loop.ts: Task queue error recovery weak (lines 283-326)
├─ bash.ts: Unsafe type casting (lines 49-54)
├─ file-ops.ts: No error differentiation (lines 46-48, 96-98)
└─ grep.ts: No error details
```

## Quick Fixes Checklist

### Immediate (1-2 hours each)

```bash
# 1. Fix CLI Entry Point
[ ] Add try-catch around repl.start() and repl.executeSingleCommand()
    File: src/cli.ts, line ~72-76
    Pattern: Wrap in try-catch, log error, exit gracefully

# 2. Fix Agent Retry Logic
[ ] Preserve error context in retry loop
    File: src/llm/agent.ts, line ~142-166
    Pattern: Throw RetryExhaustedError with original error

# 3. Fix Plugin Loader
[ ] Log individual plugin failures
    File: src/plugins/plugin-loader.ts, line ~46-49, 64-66
    Pattern: Catch and log in loadPlugin(), track failures

# 4. Fix Model Manager
[ ] Add error handling to initialize()
    File: src/llm/model-manager.ts, line ~78-81
    Pattern: Try-catch, handle Ollama connection failure

# 5. Fix Zod Validation
[ ] Use safeParse instead of parse()
    File: src/tools/tool-manager.ts, line ~140
    Pattern: Check validation.success, throw ValidationError
```

### This Week (2-4 hours each)

```bash
# 6. Standardize Tool Errors
[ ] Make all tools throw, not return error strings
    Files: src/tools/http-tool.ts, src/tools/sqlite-tool.ts
    Pattern: Throw ToolExecutionError, not return error string

# 7. Fix Stream Parsing
[ ] Accumulate stream errors, don't silently drop
    File: src/llm/ollama-client.ts, line ~73-93
    Pattern: Collect errors, throw if strict mode

# 8. Fix Config Loading
[ ] Differentiate error types in config loading
    File: src/config/index.ts, line ~31-35
    Pattern: Handle ENOENT vs JSON parse vs other errors
```

## Error Type Mapping

```typescript
// What error to throw/return for each situation

Authentication/Permission Errors
├─ EACCES (Permission Denied)
│  └─ throw ToolExecutionError(..., recoverable: false)
├─ ENOENT (File Not Found)
│  └─ throw ToolExecutionError(..., recoverable: false)
└─ Invalid Credentials
   └─ throw ToolExecutionError(..., recoverable: false)

Network Errors
├─ Connection Refused
│  └─ throw ToolExecutionError(..., recoverable: true)  // Can retry
├─ Timeout
│  └─ throw ToolExecutionError(..., recoverable: true)  // Can retry
└─ DNS Failure
   └─ throw ToolExecutionError(..., recoverable: true)  // Can retry

Validation Errors
├─ Invalid Arguments
│  └─ throw ValidationError(...)
├─ Zod Schema Violation
│  └─ throw ValidationError(...)
└─ Invalid JSON
   └─ throw ToolExecutionError(..., recoverable: false)

Operational Errors
├─ Out of Memory
│  └─ throw ToolExecutionError(..., recoverable: false)
├─ Timeout
│  └─ throw ToolExecutionError(..., recoverable: true)
└─ Partial Failure
   └─ throw StreamParseError(...)
```

## Code Templates

### Template 1: Tool Error Handling
```typescript
async function myTool(args: Args): Promise<string> {
  try {
    // ... execution ...
    return result;
  } catch (error) {
    throw ToolExecutionError.fromCatch('my_tool', error, {
      arg1: args.arg1,
      context: 'relevant context',
    });
  }
}
```

### Template 2: Zod Validation
```typescript
const validation = tool.schema.safeParse(args);
if (!validation.success) {
  const errors = validation.error.errors
    .map(e => `${e.path.join('.')}: ${e.message}`)
    .join('; ');
  throw new ValidationError('tool_name', args, `Invalid args: ${errors}`);
}
const validatedArgs = validation.data;
```

### Template 3: Retry Logic
```typescript
let lastError: unknown;
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    return await operation();
  } catch (error) {
    lastError = error;
    if (attempt < maxRetries) {
      await sleep(backoffMs * attempt);
      continue;
    }
  }
}
throw new RetryExhaustedError(lastError, maxRetries, 'Failed after retries');
```

### Template 4: Graceful Degradation
```typescript
async function operation(): Promise<Result | null> {
  try {
    return await primaryMethod();
  } catch (primary) {
    try {
      return await fallbackMethod();
    } catch (fallback) {
      ErrorLogger.logError('Both primary and fallback failed', fallback);
      return null;  // Graceful degradation
    }
  }
}
```

### Template 5: Config Loading
```typescript
async load(): Promise<Config> {
  try {
    const content = await fs.readFile(path, 'utf-8');
    let config: any;

    try {
      config = JSON.parse(content);
    } catch (parseErr) {
      console.warn('Config file corrupted, using defaults');
      return this.config;
    }

    this.config = { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return this.config;  // File doesn't exist - OK
    }
    // Other errors should be reported
    console.warn(`Config load failed: ${error}`);
  }
  return this.config;
}
```

## Common Pitfalls

### Anti-Pattern 1: String Error Returns
```typescript
// ❌ DON'T DO THIS
catch (error) {
  return `Error: ${error.message}`;  // Lose error type & stack
}

// ✅ DO THIS INSTEAD
catch (error) {
  throw ToolExecutionError.fromCatch('tool', error);
}
```

### Anti-Pattern 2: Silent Failures
```typescript
// ❌ DON'T DO THIS
try {
  await operation();
} catch (error) {
  // Empty catch - completely silent!
}

// ✅ DO THIS INSTEAD
try {
  await operation();
} catch (error) {
  if (isCritical) throw error;
  ErrorLogger.logWarning('Non-critical error', { error });
  // Graceful handling
}
```

### Anti-Pattern 3: Unsafe Type Casting
```typescript
// ❌ DON'T DO THIS
if ((error as any).timedOut) {  // Unsafe cast
  // Handle timeout
}

// ✅ DO THIS INSTEAD
if (error instanceof TimeoutError || error.code === 'ETIMEDOUT') {
  // Handle timeout
}
```

### Anti-Pattern 4: Lost Error Context
```typescript
// ❌ DON'T DO THIS
try {
  await modelManager.initialize();
} catch (error) {
  throw new Error('Failed');  // Lost original error
}

// ✅ DO THIS INSTEAD
try {
  await modelManager.initialize();
} catch (error) {
  throw new Error(
    `Model initialization failed: ${error instanceof Error ? error.message : String(error)}`
  );
}
```

### Anti-Pattern 5: Unhandled Promise
```typescript
// ❌ DON'T DO THIS
repl.start();  // Fire and forget, unhandled rejection

// ✅ DO THIS INSTEAD
try {
  await repl.start();
} catch (error) {
  ErrorLogger.logError('REPL error', error);
  process.exit(1);
}
```

## Testing Error Handling

### Test Patterns

```typescript
// Test that tool throws on invalid input
it('should throw ValidationError on invalid args', async () => {
  try {
    await myTool({ invalid: 'args' });
    fail('Should have thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toContain('Invalid arguments');
  }
});

// Test that errors are properly logged
it('should log tool execution errors', async () => {
  const logSpy = jest.spyOn(ErrorLogger, 'logError');
  try {
    await myTool(args);
  } catch (error) {
    // Verify error was logged
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('myTool'),
      error
    );
  }
});

// Test recovery paths
it('should retry on transient failures', async () => {
  let attempts = 0;
  const operation = async () => {
    attempts++;
    if (attempts < 3) throw new Error('Transient');
    return 'success';
  };

  const result = await executeWithRetry(operation, {
    maxAttempts: 3,
    backoffMultiplier: 1,
    initialDelayMs: 0,
  });

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```

## File Reference Table

| File | Problem | Fix | Priority | Time |
|------|---------|-----|----------|------|
| cli.ts | Unhandled REPL | Add try-catch | CRITICAL | 30min |
| agent.ts | Lost retry context | Throw RetryExhaustedError | CRITICAL | 30min |
| model-manager.ts | No init error | Add try-catch | CRITICAL | 20min |
| tool-manager.ts | Zod not caught | Use safeParse | CRITICAL | 30min |
| http-tool.ts | Returns errors | Throw errors | HIGH | 20min |
| sqlite-tool.ts | Returns errors | Throw errors | HIGH | 20min |
| plugin-loader.ts | Silent failures | Add logging | HIGH | 30min |
| config/index.ts | Ignores corruption | Differentiate errors | MEDIUM | 30min |
| ollama-client.ts | Silent drops | Accumulate errors | MEDIUM | 30min |
| file-ops.ts | Generic errors | Error codes | MEDIUM | 30min |

## Debug Checklist

When you encounter an error in production:

```
1. Find the error message
   ├─ Is it user-friendly?
   └─ Can you understand what went wrong?

2. Check the source file
   ├─ Is there a try-catch?
   ├─ Is the error being logged?
   └─ Is context being preserved?

3. Look for silent failures
   ├─ Empty catch blocks?
   └─ Errors returned as strings?

4. Trace error propagation
   ├─ Does error bubble up?
   ├─ Is context added at each layer?
   └─ Is final error user-friendly?

5. Verify recovery
   ├─ Can the operation retry?
   ├─ Is there a fallback?
   └─ Is failure graceful?
```

## Quick Reference Links

- **Full Audit:** ERROR_HANDLING_AUDIT.md
- **Details:** ERROR_HANDLING_DETAILS.md
- **Implementation:** ERROR_HANDLING_IMPLEMENTATION_GUIDE.md
- **Summary:** AUDIT_SUMMARY.md

