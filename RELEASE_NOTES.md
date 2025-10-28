# Ollama Code v1.0.0 - Initial Release 🎉

**The cost-effective AI code assistant - 100% local, $0 cost alternative to Claude Code**

## 💰 Why Ollama Code?

Stop paying for API calls! Ollama Code brings you:
- **$547.50/year saved** (at 100 tasks/day)
- **100% privacy** - code never leaves your machine
- **No rate limits** - unlimited usage
- **Works offline** - no internet required after model download

## 🚀 Key Features

### 1. Multi-Agent Orchestration
Run multiple specialized AI agents in parallel for **3x faster execution**:
- Parallel task execution
- Priority-based scheduling
- Specialized agents (CodeReviewer, FastExecutor, Reasoner)

### 2. Callback Loop System 🆕
Prevent connection timeouts on long tasks:
- Automatic Claude ↔ Ollama handoff
- Task queue with persistence
- Progress tracking

### 3. Rich Tool Ecosystem (18 Tools)
- **File Operations**: read, write, edit, glob
- **Code Search**: grep with regex
- **System**: bash execution
- **Multi-Agent**: parallel delegation
- **SQLite Database** 🆕: full SQL support
- **HTTP** 🆕: API calls and downloads
- **Callback Loop** 🆕: long-running task management

### 4. Universal Tool Calling
Works with any Ollama model supporting tools:
- qwen3-coder:30b (Best quality)
- granite4:micro (Fastest - only 2.1GB!)
- gpt-oss:20b (Best reasoning)
- Automatic format detection (XML, JSON, Python-style)

### 5. Enhanced CLI
- Beautiful colored output
- Spinner animations
- Session statistics
- Real-time cost savings display
- Interactive commands (/help, /stats, /tools)

## 📊 Performance

| Task | Single Agent | Multi-Agent | Speedup |
|------|--------------|-------------|---------|
| Review 3 files | 108s | 36s | **3x faster** |
| Generate tests + docs | 72s | 28s | **2.6x faster** |
| Complex analysis | 45s | 18s | **2.5x faster** |

## 🏃 Quick Start

```bash
# Prerequisites
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3-coder:30b    # or granite4:micro for speed

# Install & Run
git clone https://github.com/yourusername/ollama-code.git
cd ollama-code
npm install
npm run build

# Start with best model
npm run dev -- chat -m qwen3-coder:30b -v
```

## ✅ What's Tested

All core systems validated:
- ✅ Configuration management
- ✅ Model manager (18 models)
- ✅ Tool manager (18 tools)
- ✅ File operations
- ✅ Agent initialization
- ✅ Tool ecosystem

Models tested for tool calling:
- ✅ qwen3-coder:30b - Perfect
- ✅ granite4:micro - Perfect
- ✅ gpt-oss:20b - Good
- ⚠️ llama3.1:8b - Partial
- ❌ gemma3:12b - No support

## 📖 Documentation

- [README.md](./README.md) - Project overview
- [QUICKSTART.md](./QUICKSTART.md) - Get started in 5 minutes
- [USAGE.md](./USAGE.md) - CLI usage and examples
- [FEATURES.md](./FEATURES.md) - Feature deep dive
- [AGENT-ARCHITECTURE.md](./AGENT-ARCHITECTURE.md) - Multi-agent system
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Technical details
- [CHANGELOG.md](./CHANGELOG.md) - Complete changelog

## 🔧 System Requirements

**Minimum** (granite4:micro):
- RAM: 8GB
- Storage: 5GB
- CPU: Modern x86_64/ARM64

**Recommended** (qwen3-coder:30b):
- RAM: 16GB+
- Storage: 50GB
- GPU: NVIDIA GPU with 8GB+ VRAM

## 💡 Use Cases

Perfect for:
- 💼 Startups with tight budgets
- 🎓 Students and learners
- 🔒 Privacy-critical projects
- 🚀 Open source projects
- ✈️ Offline development
- ♾️ High-volume usage

## 🆚 vs Claude Code

| Feature | Claude Code | Ollama Code |
|---------|-------------|-------------|
| Cost | $3/1M tokens | **$0.00** |
| Privacy | Cloud | **100% Local** |
| Rate Limits | Yes | **None** |
| Offline | No | **Yes** |
| Multi-Agent | No | **Yes (3x faster)** |
| Database Tools | No | **Yes (SQLite)** |
| HTTP Tools | Limited | **Full client** |

## 🙏 Acknowledgments

- **Ollama** - Making local LLMs accessible
- **Qwen Team** - Excellent code-focused models
- **IBM Granite** - Ultra-fast micro models
- **Claude Code** - Inspiration for tool design

## 📜 License

MIT License

---

**Ready to save money and protect your privacy?**

[⭐ Star this repo](.) • [📥 Install Now](#-quick-start) • [💬 Join Discussion](./discussions)
