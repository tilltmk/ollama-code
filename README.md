# ollama-code

Cost-effective AI code assistant - 100% local, $0 cost alternative to Claude Code

## Features

- 🚀 **100% Local** - Run everything on your machine, no cloud dependencies
- 💰 **Zero Cost** - Use free local LLMs via Ollama
- 🛠️ **Full-Featured** - File operations, code execution, SQLite, and more
- 🎯 **Production Ready** - Robust error handling, testing, and performance optimizations
- 🔌 **Plugin System** - Extend with custom tools and commands
- 🤖 **MCP Server** - Model Context Protocol support for advanced integrations

## Installation

```bash
npm install -g ollama-code
```

## Prerequisites

- Node.js >= 18.0.0
- [Ollama](https://ollama.ai) installed and running locally
- A model installed in Ollama (e.g., `ollama pull qwen2.5-coder`)

## Quick Start

```bash
# Start the interactive CLI
ollama-code

# Run with a specific model
ollama-code --model qwen2.5-coder

# Start as MCP server
ollama-code-mcp
```

## Configuration

Create a `.ollama-code.yaml` file in your project root:

```yaml
model: qwen2.5-coder
temperature: 0.7
max_tokens: 4096
tools:
  enabled: true
  parallel: true
```

## Available Tools

- **File Operations**: Read, write, edit files
- **Code Execution**: Run bash commands and scripts
- **Search**: Advanced grep and file search
- **SQLite**: Database operations
- **Web Fetch**: Retrieve and analyze web content
- **Plugin System**: Add custom tools and commands

## CLI Commands

- `/help` - Show available commands
- `/clear` - Clear conversation history
- `/model <name>` - Switch to a different model
- `/tools` - List available tools
- `/exit` - Exit the CLI

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/ollama-code.git
cd ollama-code

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start in development mode
npm run dev
```

## Architecture

- **TypeScript** - Full type safety
- **Zod Validation** - Runtime type checking
- **Plugin System** - Extensible architecture
- **Error Handling** - Comprehensive error recovery
- **Performance** - Optimized algorithms and memory management
- **Testing** - 80+ tests with Vitest

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and feature requests, please visit [GitHub Issues](https://github.com/yourusername/ollama-code/issues).