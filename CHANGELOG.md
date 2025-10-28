# Changelog

All notable changes to Ollama Code will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-28

### Initial Release 🎉

**Ollama Code** - A cost-effective alternative to Claude Code using 100% local Ollama models.

### Features

#### Core System
- **Agent System** - Main agent with conversation history and system prompts
- **Model Manager** - Automatic model selection based on task type
- **Tool Manager** - Zod schema to JSON conversion for Ollama compatibility
- **Enhanced CLI** - Beautiful terminal UI with colors, spinners, and statistics
- **Configuration Management** - JSON-based config with environment variable support

#### Multi-Agent Orchestration
- **Sub-Agent System** - Delegate tasks to specialized agents
- **Parallel Execution** - Run multiple agents simultaneously (3x faster)
- **Priority-Based Execution** - Smart task scheduling
- **Specialized Agent Types** - CodeReviewer, FastExecutor, Reasoner, FileExpert

#### Callback Loop System (NEW)
- **Automatic Handoff** - Claude ↔ Ollama loop prevents connection timeouts
- **Task Queue** - JSON-persisted task management
- **Priority System** - Execute high-priority tasks first
- **Progress Tracking** - Monitor long-running operations

#### Tool Ecosystem (18 Tools)

**File Operations** (4 tools)
- `read_file` - Read files with optional line range and line numbers
- `write_file` - Create or overwrite files
- `edit_file` - Line-aware file editing with string replacement
- `glob` - Pattern-based file search

**Code Search** (1 tool)
- `grep` - Ripgrep integration with regex, file type filtering, context lines

**System** (1 tool)
- `bash` - Execute shell commands

**Multi-Agent** (1 tool)
- `delegate_to_subagents` - Parallel/sequential/smart task delegation

**SQLite Database** (5 tools - NEW)
- `sql_query` - Execute SQL queries (SELECT, INSERT, UPDATE, DELETE, etc.)
- `sql_create_table` - Create database tables
- `sql_list_tables` - List all tables in database
- `sql_describe_table` - Get table schema
- `sql_close_database` - Close database connections

**HTTP** (2 tools - NEW)
- `http_request` - Make HTTP requests (GET, POST, PUT, DELETE, PATCH)
- `download_file` - Download files from URLs

**Callback Loop** (4 tools - NEW)
- `start_callback_loop` - Start long-running task loop
- `add_callback_task` - Add tasks to queue
- `process_claude_feedback` - Process Claude's responses
- `get_callback_results` - Get execution results

#### Features

**Universal Tool Calling**
- Automatic format detection (XML, JSON, Python-style)
- Works with qwen3-coder, granite4:micro, gpt-oss, llama3.1
- Multi-format parser handles different model conventions

**Auto-Retry Logic**
- Exponential backoff
- 3 retry attempts by default
- 95% → 99.9% success rate

**Enhanced CLI**
- Beautiful colored output with chalk
- Spinner animations with ora
- Session statistics tracking
- Real-time cost savings display
- Interactive commands (/help, /stats, /tools, etc.)

**Cost Savings**
- $0.00 vs $3.00 per 1M tokens
- Real-time savings calculator
- Session statistics

### Performance

| Task Type | Single Agent | Multi-Agent | Speedup |
|-----------|--------------|-------------|---------|
| Review 3 files | 108s | 36s | 3.0x |
| Generate tests + docs | 72s | 28s | 2.6x |
| Complex analysis | 45s | 18s | 2.5x |

### Tested Models

✅ **Perfect Tool Support**
- qwen3-coder:30b (XML format) - Best code quality
- granite4:micro (JSON format) - Fastest (2.1GB)

✅ **Good Support**
- gpt-oss:20b (Python-style) - Best reasoning

⚠️ **Partial Support**
- llama3.1:8b - Understands tools but formatting issues
- granite3.3:8b - Partial support

❌ **No Tool Support**
- gemma3:12b - No tool calling capability

### Documentation

- **README.md** - Comprehensive project overview with cost calculator
- **QUICKSTART.md** - 5-minute getting started guide
- **USAGE.md** - Detailed CLI usage and examples
- **FEATURES.md** - Deep dive into all features
- **AGENT-ARCHITECTURE.md** - Multi-agent system explained
- **IMPLEMENTATION.md** - Technical architecture details
- **TEST-REPORT.md** - Benchmark results and test data

### System Requirements

**Minimum** (granite4:micro)
- RAM: 8GB
- Storage: 5GB
- CPU: Modern x86_64/ARM64

**Recommended** (qwen3-coder:30b)
- RAM: 16GB+
- Storage: 50GB
- GPU: NVIDIA GPU with 8GB+ VRAM

**Optimal**
- RAM: 32GB+
- Storage: 100GB+ NVMe SSD
- GPU: NVIDIA RTX 3090/4090 or Apple M1/M2 Max

### Known Issues

- Some models (llama3.1, gpt-oss) may require format assistance
- First model load takes 2-5 seconds (subsequent calls are instant)
- CPU-only inference is slower than GPU acceleration

### Technical Stack

- **Language**: TypeScript 5.3
- **Runtime**: Node.js 18+
- **Dependencies**:
  - commander - CLI framework
  - chalk - Terminal colors
  - ora - Spinner animations
  - zod - Schema validation
  - better-sqlite3 - SQLite database
  - node-fetch - HTTP client
  - glob - File pattern matching
  - execa - Shell execution

### License

MIT License - See LICENSE file for details

---

## Future Plans

- [ ] Result caching
- [ ] Dynamic model selection
- [ ] Sub-agent communication
- [ ] Visual progress tracking
- [ ] Cost analytics dashboard
- [ ] Docker containerization
- [ ] VS Code extension

---

**Contributors**: Initial implementation by bricked-code team

**Special Thanks**: Ollama, Qwen Team, IBM Granite, Anthropic Claude Code
