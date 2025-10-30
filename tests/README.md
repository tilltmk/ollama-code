# Testing Infrastructure

This directory contains the testing infrastructure for ollama-code using Vitest.

## Structure

```
tests/
├── setup.ts              # Global test setup and mocks
├── mocks/               # Mock implementations
│   ├── ollama-client.mock.ts  # Mock OllamaClient
│   ├── file-system.mock.ts    # Mock file system operations
│   └── bash.mock.ts           # Mock bash command execution
└── README.md            # This file
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests once and exit
npm run test:run

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with UI
npm run test:ui
```

## Writing Tests

Tests are colocated with source files:
- `src/llm/agent.test.ts` - Tests for Agent class
- `src/tools/tool-manager.test.ts` - Tests for ToolManager
- `src/llm/callback-loop.test.ts` - Tests for CallbackLoop

### Example Test

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Agent } from './agent.js';

describe('Agent', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent(mockConfig, mockToolManager, mockModelManager);
  });

  it('should handle user messages', () => {
    agent.addUserMessage('Hello');
    expect(agent.getHistory()).toHaveLength(1);
  });
});
```

## Mock Usage

### OllamaClient Mock

```typescript
import { createMockOllamaClient } from '../tests/mocks/ollama-client.mock.js';

const mockClient = createMockOllamaClient();

// Mock a tool call response
mockClient.mockToolCallResponse([
  {
    id: 'call_1',
    function: { name: 'test_tool', arguments: '{}' }
  }
]);

// Mock a text response
mockClient.mockTextResponse('Final answer');

// Mock an error
mockClient.mockError(new Error('Network error'));
```

### File System Mock

```typescript
import { createMockFileSystem } from '../tests/mocks/file-system.mock.js';

const mockFs = createMockFileSystem();

// Add mock files
mockFs.addFile('/path/to/file.txt', 'content');
mockFs.addDirectory('/path/to/dir');

// Check existence
mockFs.hasFile('/path/to/file.txt'); // true

// Get content
mockFs.getFileContent('/path/to/file.txt'); // 'content'
```

### Bash Mock

```typescript
import { createMockBashExecutor } from '../tests/mocks/bash.mock.js';

const mockBash = createMockBashExecutor();

// Set command result
mockBash.setCommandResult('ls -la', {
  stdout: 'file1.txt\nfile2.txt',
  stderr: '',
  exitCode: 0
});

// Mock error
mockBash.mockCommandError('failing-command', new Error('Command failed'));
```

## Coverage Thresholds

Current coverage thresholds are set in `vitest.config.ts`:
- Statements: 60%
- Branches: 60%
- Functions: 60%
- Lines: 60%

Coverage reports are generated in:
- Text format (console output)
- JSON format (`coverage/coverage.json`)
- HTML format (`coverage/index.html`)

## Best Practices

1. **Use descriptive test names**: Test names should clearly describe what is being tested
2. **One assertion per test**: Keep tests focused on a single behavior
3. **Mock external dependencies**: Use the provided mocks for OllamaClient, file system, etc.
4. **Clean up after tests**: Use `afterEach` to reset mocks and state
5. **Test edge cases**: Include tests for error conditions and boundary cases
6. **Keep tests independent**: Tests should not depend on execution order

## Critical Test Suites

### Agent Tests (`src/llm/agent.test.ts`)
- Conversation history management
- Memory compression
- Thinking/reasoning extraction
- Tool execution
- Retry mechanism
- Iteration limits

### ToolManager Tests (`src/tools/tool-manager.test.ts`)
- Tool registration
- Zod to JSON Schema conversion
- Tool execution
- Parallel tool execution
- Error handling

### CallbackLoop Tests (`src/llm/callback-loop.test.ts`)
- Task management
- Priority-based execution
- State persistence
- Claude/Ollama handoff
- Task retry logic

## Debugging Tests

To debug a specific test:

```bash
# Run a single test file
npx vitest run src/llm/agent.test.ts

# Run tests matching a pattern
npx vitest run -t "conversation history"

# Run with verbose output
npx vitest run --reporter=verbose
```

## CI/CD Integration

Tests should run on every commit. Example GitHub Actions workflow:

```yaml
- name: Run tests
  run: npm run test:run

- name: Check coverage
  run: npm run test:coverage
```
