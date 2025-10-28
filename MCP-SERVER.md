# Ollama Code MCP Server

This document explains how to use Ollama Code as an MCP (Model Context Protocol) server with Claude Code.

## What is MCP?

MCP (Model Context Protocol) allows Claude Code to access local tools and services. The Ollama Code MCP Server exposes all Ollama-powered tools to Claude Code, enabling you to use local AI models with Claude's interface.

## Setup

### 1. Build the Project

```bash
cd ollama-code
npm install
npm run build
```

### 2. Configure Claude Code

The MCP server is automatically configured if you have a `.claude/mcp.json` file in your project root. The configuration should look like this:

```json
{
  "mcpServers": {
    "ollama-code": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/ollama-code",
      "description": "Ollama Code MCP Server - Local AI coding assistant"
    }
  }
}
```

### 3. Restart Claude Code

After adding the MCP configuration, restart Claude Code to load the MCP server.

## Available Tools

The MCP server exposes 18 tools:

### File Operations
- **read_file**: Read file contents with optional line range
- **write_file**: Write content to a file
- **edit_file**: Edit existing files with string replacement
- **glob**: Find files using glob patterns

### Code Search
- **grep**: Search code with regex patterns (ripgrep-like)

### System Execution
- **bash**: Execute bash commands

### HTTP Requests
- **http_get**: Make HTTP GET requests
- **http_post**: Make HTTP POST requests
- **http_download**: Download files from URLs

### Database Operations
- **sql_execute**: Execute SQL queries on SQLite databases
- **sql_query**: Query SQLite databases
- **sql_create_table**: Create tables in SQLite

### Multi-Agent Orchestration
- **delegate_to_subagents**: Run multiple tasks in parallel using sub-agents

### Callback Loop System
- **start_callback_loop**: Start long-running task loops
- **add_callback_task**: Add tasks to the callback queue
- **get_callback_results**: Get results from callback tasks
- **process_claude_response**: Process Claude's feedback in the loop

## Usage Examples

### Example 1: Read a File

```typescript
// Claude Code will use the MCP server automatically
// Just ask Claude to read a file:
"Read the package.json file"
```

### Example 2: Search Code

```typescript
// Search for async functions
"Find all async functions in the src directory"
```

### Example 3: Execute Bash Commands

```typescript
// Run npm install
"Execute npm install"
```

### Example 4: Multi-Agent Tasks

```typescript
// Process multiple files in parallel
"Review all TypeScript files in src/ using sub-agents"
```

## Development Mode

For development, you can run the MCP server directly:

```bash
npm run mcp
```

This starts the server in stdio mode, ready to receive MCP requests.

## Production Mode

For production use with the compiled version:

```bash
node dist/mcp-server.js
```

## Troubleshooting

### Server Not Starting

1. Ensure Ollama is running: `ollama serve`
2. Check that Node.js 18+ is installed: `node --version`
3. Verify the build completed: `ls -la dist/mcp-server.js`

### Tools Not Available in Claude Code

1. Restart Claude Code after adding the MCP configuration
2. Check the MCP server logs (stderr output)
3. Verify the `cwd` path in `mcp.json` is correct

### Ollama Connection Issues

1. Check Ollama is accessible: `curl http://localhost:11434/api/tags`
2. Verify the Ollama URL in `~/.ollama-code/config.json`
3. Check firewall settings

## Architecture

```
┌─────────────┐         MCP Protocol          ┌──────────────────┐
│ Claude Code │ ◄────────(stdio)────────────► │ Ollama Code MCP  │
│             │                                │     Server       │
└─────────────┘                                └──────────────────┘
                                                        │
                                                        ▼
                                               ┌──────────────────┐
                                               │  Ollama Models   │
                                               │  (Local LLMs)    │
                                               └──────────────────┘
```

## Benefits

- **$0 Cost**: Run AI-powered tools locally without API costs
- **Privacy**: All data stays on your machine
- **Speed**: No network latency for tool execution
- **Unlimited**: No rate limits or quotas
- **Offline**: Works without internet connection

## License

MIT - See LICENSE file for details
