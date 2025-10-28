# Usage Guide - Ollama Code

## Installation

```bash
cd /home/core/dev/bricked-code/ollama-code
npm install
npm run build

# Optional: Install globally
npm run link
```

## Basic Usage

### Start Interactive Chat (Default)

```bash
# Using npm dev
npm run dev

# Or after global install
ollama-code

# Or explicitly with 'chat' command
ollama-code chat
```

### CLI Flags & Options

#### Select a Specific Model

```bash
# Use Qwen3-Coder (best for code)
npm run dev -- chat --model qwen3-coder:30b

# Use GPT-OSS (best for reasoning)
npm run dev -- chat --model gpt-oss:20b

# Use Llama 3.1 (fastest)
npm run dev -- chat --model llama3.1:8b
```

#### Enable Verbose Mode

```bash
# See all tool calls and iterations
npm run dev -- chat --verbose

# Short form
npm run dev -- chat -v
```

#### Combine Options

```bash
# Qwen3-Coder with verbose output
npm run dev -- chat -m qwen3-coder:30b -v

# GPT-OSS with custom temperature
npm run dev -- chat -m gpt-oss:20b -t 0.5

# All options
npm run dev -- chat -m qwen3-coder:30b -v -t 0.7 --url http://localhost:11434
```

#### Custom Ollama Server

```bash
# Connect to remote Ollama
npm run dev -- chat --url http://192.168.1.100:11434

# Or use environment variable
export OLLAMA_URL=http://192.168.1.100:11434
npm run dev
```

### Quick Commands

```bash
# Check health
npm run dev -- health

# List models
npm run dev -- models

# Show help
npm run dev -- --help
npm run dev -- chat --help
```

## Example Sessions

### Example 1: File Operations

```bash
$ npm run dev -- chat -m qwen3-coder:30b -v

ollama-code> Create a file called hello.txt with "Hello World!"

[Iteration 1]
Tool calls: write_file
✓ Response: File created successfully: hello.txt

ollama-code> Now read that file
[Iteration 1]
Tool calls: read_file
✓ Response:
1→Hello World!
```

### Example 2: Code Search

```bash
$ npm run dev -- chat -m qwen3-coder:30b

ollama-code> Find all TypeScript files in the src directory

✓ Response: Found 15 TypeScript files:
src/cli.ts
src/cli/repl.ts
src/llm/agent.ts
src/llm/model-manager.ts
...
```

### Example 3: Complex Task

```bash
$ npm run dev -- chat -m gpt-oss:20b -v

ollama-code> Search for all files containing "OllamaClient", then read the main one

[Iteration 1]
Tool calls: grep
[Files found: src/llm/ollama-client.ts, src/llm/agent.ts]

[Iteration 2]
Tool calls: read_file
[Reading src/llm/ollama-client.ts]

✓ Response: The OllamaClient class provides...
[Shows summary of the file]
```

## Environment Variables

```bash
# Ollama server URL
export OLLAMA_URL=http://localhost:11434

# Default model
export DEFAULT_MODEL=qwen3-coder:30b

# Then start
npm run dev
```

## Configuration File

Create `~/.ollama-code/config.json`:

```json
{
  "ollamaUrl": "http://localhost:11434",
  "defaultModel": "qwen3-coder:30b",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

## REPL Commands

Once in the REPL:

```
/help          Show help
/models        List available models
/model NAME    Switch to a different model
/verbose       Toggle verbose mode
/clear         Clear conversation history
/exit          Exit REPL
```

## Example Workflows

### Workflow 1: Code Review

```bash
# Start with Qwen3-Coder for code analysis
ollama-code chat -m qwen3-coder:30b

> Find all .ts files in src/tools
> Read the file-ops.ts file
> Explain what the write_file function does
> Are there any potential bugs?
```

### Workflow 2: Project Exploration

```bash
# Use verbose mode to see tool usage
ollama-code chat -v

> What TypeScript files exist in this project?
> Show me the directory structure
> Search for all occurrences of "ToolManager"
```

### Workflow 3: Development Assistant

```bash
# Use GPT-OSS for planning, then Qwen for coding
ollama-code chat -m gpt-oss:20b

> Plan a new feature: add support for JSON file validation
> /model qwen3-coder:30b
> Implement the JSON validation tool we discussed
```

## Advanced Usage

### Direct Tool Testing

```bash
# Run the tool test suite
npx tsx test-simple.ts

# Run integration tests
npx tsx test-integration.ts
```

### Development Mode

```bash
# Watch mode (auto-rebuild on changes)
npm run watch

# In another terminal, run
npm run dev
```

### Custom Script with Ollama Code

```typescript
import { Agent } from './src/llm/agent.js';
import { ModelManager } from './src/llm/model-manager.js';
import { ToolManager } from './src/tools/tool-manager.js';
import { ConfigManager } from './src/config/index.js';
import { allTools } from './src/tools/index.js';

const config = new ConfigManager();
await config.load();

const toolManager = new ToolManager();
toolManager.registerTools(allTools);

const modelManager = new ModelManager(config.get());
await modelManager.initialize();

const agent = new Agent(config.get(), toolManager, modelManager);

const response = await agent.run('List all files in src/', {
  verbose: true,
  model: 'qwen3-coder:30b'
});

console.log(response);
```

## Troubleshooting

### "Cannot connect to Ollama server"

```bash
# Check if Ollama is running
ollama list

# If not, start it
ollama serve

# Or specify a different URL
ollama-code chat --url http://localhost:11434
```

### Model Not Found

```bash
# List available models
ollama list

# Pull a model if needed
ollama pull qwen3-coder:30b
ollama pull gpt-oss:20b
ollama pull llama3.1:8b

# Verify
ollama-code models
```

### Tool Call Not Working

Some models have better tool calling support than others:
- ✅ Llama 3.1 - Excellent tool calling
- ⚠️ Qwen3-Coder - Understands tools but uses non-standard format
- ⚠️ GPT-OSS - Variable support

For best results, use: `-m llama3.1:8b`

## Performance Tips

1. **Use smaller models for simple tasks**
   ```bash
   ollama-code chat -m llama3.1:8b
   ```

2. **Lower temperature for deterministic outputs**
   ```bash
   ollama-code chat -t 0.3
   ```

3. **Use verbose mode only when debugging**
   ```bash
   # Adds overhead
   ollama-code chat -v
   ```

4. **Enable GPU acceleration**
   - Ensure NVIDIA drivers are installed
   - Ollama automatically uses GPU if available

## Comparison with Similar Tools

### vs Aider
```bash
# Aider
aider --model gpt-4

# Ollama Code (100% local)
ollama-code chat -m qwen3-coder:30b
```

### vs GitHub Copilot CLI
```bash
# Copilot (cloud-based)
gh copilot suggest "list files"

# Ollama Code (local)
ollama-code chat -m llama3.1:8b
> list files in current directory
```

## Next Steps

1. Try the examples above
2. Explore different models
3. Create custom workflows
4. Contribute to the project

## Support

- 📖 README: `README.md`
- 🔧 Implementation: `IMPLEMENTATION.md`
- 🚀 Quick Start: `QUICKSTART.md`
- 🧪 Test Report: `TEST-REPORT.md`
- 📝 This guide: `USAGE.md`

---

**Happy Coding with Ollama Code!** 🚀
