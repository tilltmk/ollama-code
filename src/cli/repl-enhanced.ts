import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { Agent } from '../llm/agent.js';
import { ModelManager } from '../llm/model-manager.js';
import { ToolManager } from '../tools/tool-manager.js';
import { ConfigManager } from '../config/index.js';
import { CallbackLoop } from '../llm/callback-loop.js';
import { setSubAgentOrchestrator } from '../tools/sub-agent-tool.js';
import { setCallbackLoop } from '../tools/callback-tool.js';
import { SubAgentOrchestrator } from '../llm/sub-agent.js';
import { fileTools, grepTool, bashTool, sqliteTools, httpTools, callbackLoopTools, subAgentTool } from '../tools/index.js';
import type { Config } from '../types/index.js';

export interface REPLOptions {
  verbose?: boolean;
  enableSubAgents?: boolean;
  config?: Config;
  showThinking?: boolean;
}

interface SessionStats {
  totalRequests: number;
  totalTokens: number;
  toolCalls: number;
  startTime: number;
  claudeCostSaved: number; // Estimated in USD
}

export class EnhancedREPL {
  private agent: Agent;
  private modelManager: ModelManager;
  private toolManager: ToolManager;
  private configManager: ConfigManager;
  private rl: readline.Interface;
  private verbose: boolean = false;
  private showThinking: boolean = true; // Show thinking by default
  private stats: SessionStats;
  private callbackLoop: CallbackLoop;
  private orchestrator: SubAgentOrchestrator | null = null;
  private lastSigintTime: number = 0;
  private enableSubAgents: boolean = false;

  constructor(options: REPLOptions = {}) {
    this.verbose = options.verbose !== undefined ? options.verbose : true;
    this.showThinking = options.showThinking !== undefined ? options.showThinking : true;
    this.enableSubAgents = options.enableSubAgents || false;
    this.configManager = new ConfigManager();

    // Use provided config or default
    if (options.config) {
      this.configManager.update(options.config);
    }

    const config = this.configManager.get();

    this.toolManager = new ToolManager();
    this.modelManager = new ModelManager(config);
    this.agent = new Agent(config, this.toolManager, this.modelManager);

    // Initialize orchestrator and callback loop only if sub-agents are enabled
    if (this.enableSubAgents) {
      this.orchestrator = new SubAgentOrchestrator(config, this.toolManager, this.modelManager);
      setSubAgentOrchestrator(this.orchestrator);
    }

    this.callbackLoop = new CallbackLoop(config, this.toolManager, this.modelManager, {
      verbose: this.verbose
    });

    // Set callback loop for tools
    setCallbackLoop(this.callbackLoop);

    // Ensure stdin stays open
    process.stdin.resume();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan.bold('💻 ollama-code ❯ '),
      terminal: true,
    });

    this.stats = {
      totalRequests: 0,
      totalTokens: 0,
      toolCalls: 0,
      startTime: Date.now(),
      claudeCostSaved: 0
    };
  }

  /**
   * Initialize REPL
   */
  async initialize(): Promise<void> {
    // Load configuration
    await this.configManager.load();

    // Register tools based on configuration
    const tools = [
      ...fileTools,
      grepTool,
      bashTool,
      ...sqliteTools,
      ...httpTools,
      ...callbackLoopTools,
    ];

    // Only add sub-agent tool if enabled
    if (this.enableSubAgents) {
      tools.push(subAgentTool);
    }

    this.toolManager.registerTools(tools);

    // Initialize model manager
    await this.modelManager.initialize();

    // Initialize callback loop
    await this.callbackLoop.initialize();

    // Set system prompt
    const subAgentText = this.enableSubAgents
      ? '\n- Sub-agent delegation (parallel task execution)\nFor complex multi-step tasks, consider using sub-agents for parallel execution.'
      : '';

    const systemPrompt = `You are a helpful coding assistant powered by local Ollama models.
You have access to:
- File operations (read, write, edit, glob)
- Code search (grep with regex)
- Bash execution${subAgentText}
- HTTP requests
- SQLite databases
- Callback loop system (for long-running tasks)

Always use the appropriate tools to interact with the system.
Be concise and helpful. When writing code, ensure it's correct and follows best practices.
For very long tasks that might timeout, use the callback loop system.`;

    this.agent.setSystemPrompt(systemPrompt);
  }

  /**
   * Display welcome message
   */
  displayWelcome(): void {
    console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║    🚀 Ollama Code Assistant (Enhanced)   ║'));
    console.log(chalk.bold.cyan('╚═══════════════════════════════════════════╝'));
    console.log(chalk.gray('  100% Local • 100% Free • 100% Private\n'));

    const modelsSummary = this.modelManager.getModelsSummary();
    console.log(chalk.yellow.bold('📦 Available Models:'));
    console.log(modelsSummary);

    const config = this.configManager.get();
    const currentModel = this.modelManager.selectModelForTask('code');
    console.log(chalk.green.bold(`\n✨ Current Model: ${currentModel}`));
    console.log(chalk.gray(`🔗 Ollama URL: ${config.ollamaUrl}`));
    console.log(chalk.gray(`🎯 Temperature: ${config.temperature}`));
    console.log(chalk.gray(`🔢 Max Tokens: ${config.maxTokens}\n`));

    console.log(chalk.cyan.bold('📚 Tools Available:'));
    console.log(chalk.gray(`  • File Operations (read, write, edit, glob)`));
    console.log(chalk.gray(`  • Code Search (grep with regex)`));
    console.log(chalk.gray(`  • Bash Execution`));
    if (this.enableSubAgents) {
      console.log(chalk.gray(`  • Sub-Agent Delegation (parallel execution)`));
    }
    console.log(chalk.gray(`  • HTTP Requests (API calls)`));
    console.log(chalk.gray(`  • SQLite Database`));
    console.log(chalk.gray(`  • Callback Loop (timeout prevention)\n`));

    console.log(chalk.yellow.bold('💰 Cost Savings:'));
    console.log(chalk.gray(`  Claude API cost: ~$3.00 per 1M tokens`));
    console.log(chalk.gray(`  Ollama cost: $0.00 (100% local)`));
    console.log(chalk.green.bold(`  You save: $3.00 per 1M tokens!\n`));

    console.log(chalk.magenta.bold('⌨️  Commands:'));
    console.log(chalk.gray('  /help         Show this help'));
    console.log(chalk.gray('  /models       List available models'));
    console.log(chalk.gray('  /model        Change current model'));
    console.log(chalk.gray('  /verbose      Toggle verbose mode'));
    console.log(chalk.gray('  /thinking     Toggle thinking display'));
    console.log(chalk.gray('  /load <file>  Load and process MD file'));
    console.log(chalk.gray('  /stats        Show session statistics'));
    console.log(chalk.gray('  /tools        Show available tools'));
    console.log(chalk.gray('  /clear        Clear conversation history'));
    console.log(chalk.gray('  /reset        Reset session stats'));
    console.log(chalk.gray('  /exit         Exit REPL\n'));
  }

  /**
   * Display session statistics
   */
  private displayStats(): void {
    const sessionDuration = (Date.now() - this.stats.startTime) / 1000;
    const minutes = Math.floor(sessionDuration / 60);
    const seconds = Math.floor(sessionDuration % 60);

    console.log(chalk.cyan.bold('\n📊 Session Statistics'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.yellow(`  Total Requests: ${this.stats.totalRequests}`));
    console.log(chalk.yellow(`  Total Tokens (est.): ${this.stats.totalTokens.toLocaleString()}`));
    console.log(chalk.yellow(`  Tool Calls: ${this.stats.toolCalls}`));
    console.log(chalk.yellow(`  Session Duration: ${minutes}m ${seconds}s`));

    console.log(chalk.green.bold(`\n💰 Cost Savings:`));
    console.log(chalk.green(`  Claude API cost: $${this.stats.claudeCostSaved.toFixed(4)}`));
    console.log(chalk.green(`  Ollama cost: $0.0000`));
    console.log(chalk.green.bold(`  You saved: $${this.stats.claudeCostSaved.toFixed(4)} 🎉`));

    if (this.stats.totalRequests > 0) {
      const avgTokens = this.stats.totalTokens / this.stats.totalRequests;
      console.log(chalk.gray(`\n  Average tokens per request: ${avgTokens.toFixed(0)}`));
    }
    console.log();
  }

  /**
   * Display available tools
   */
  private displayTools(): void {
    const tools = this.toolManager.getAllTools();

    console.log(chalk.cyan.bold('\n🔧 Available Tools'));
    console.log(chalk.gray('─'.repeat(50)));

    const categories = {
      'File Operations': tools.filter(t => ['read_file', 'write_file', 'edit_file', 'glob'].includes(t.name)),
      'Code Search': tools.filter(t => t.name === 'grep'),
      'System': tools.filter(t => t.name === 'bash'),
      'Multi-Agent': tools.filter(t => t.name === 'delegate_to_subagents'),
      'Database': tools.filter(t => t.name.startsWith('sql_')),
      'HTTP': tools.filter(t => t.name.startsWith('http_')),
      'Workflow': tools.filter(t => t.name.startsWith('start_callback') || t.name.startsWith('add_callback') || t.name.startsWith('get_callback') || t.name.startsWith('process_claude'))
    };

    for (const [category, categoryTools] of Object.entries(categories)) {
      if (categoryTools.length > 0) {
        console.log(chalk.yellow.bold(`\n  ${category}:`));
        categoryTools.forEach(tool => {
          console.log(chalk.gray(`    • ${tool.name.padEnd(25)} ${tool.description.substring(0, 50)}...`));
        });
      }
    }
    console.log();
  }

  /**
   * Handle special commands
   */
  private async handleCommand(line: string): Promise<boolean> {
    const trimmed = line.trim().toLowerCase();

    if (trimmed === '/help') {
      this.displayWelcome();
      return true;
    }

    if (trimmed === '/models') {
      console.log(chalk.yellow.bold('\n📦 Available Models:'));
      console.log(this.modelManager.getModelsSummary());
      return true;
    }

    if (trimmed.startsWith('/model')) {
      const parts = line.split(' ');
      if (parts.length > 1) {
        const modelName = parts.slice(1).join(' ');
        if (this.modelManager.isModelAvailable(modelName)) {
          this.configManager.update({ defaultModel: modelName });
          console.log(chalk.green(`✓ Switched to model: ${modelName}`));
        } else {
          console.log(chalk.red(`✗ Model not available: ${modelName}`));
          console.log(chalk.gray('Available models:'));
          console.log(this.modelManager.getModelsSummary());
        }
      } else {
        const current = this.configManager.get().defaultModel;
        console.log(chalk.yellow(`Current model: ${current}`));
      }
      return true;
    }

    if (trimmed === '/verbose') {
      this.verbose = !this.verbose;
      console.log(chalk.yellow(`🔊 Verbose mode: ${this.verbose ? chalk.green('ON') : chalk.red('OFF')}`));
      return true;
    }

    if (trimmed === '/thinking') {
      this.showThinking = !this.showThinking;
      console.log(chalk.yellow(`🧠 Thinking display: ${this.showThinking ? chalk.green('ON') : chalk.red('OFF')}`));
      return true;
    }

    if (trimmed.startsWith('/load')) {
      const parts = line.split(' ');
      if (parts.length < 2) {
        console.log(chalk.red('✗ Usage: /load <file>'));
        return true;
      }
      const filePath = parts.slice(1).join(' ').trim();

      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const resolvedPath = path.resolve(filePath);
        const content = await fs.readFile(resolvedPath, 'utf-8');

        // Process the file content as a prompt
        console.log(chalk.green(`✓ Loaded ${filePath} (${content.length} chars)`));
        console.log(chalk.gray('Processing...\n'));

        // Process with agent
        const spinner = ora({
          text: 'Thinking...',
          spinner: 'dots'
        }).start();

        try {
          const startTime = Date.now();
          const response = await this.agent.run(content, {
            verbose: this.verbose,
          });

          const duration = Date.now() - startTime;
          const history = this.agent.getHistory();
          const toolCallsMade = history.filter(msg => msg.tool_calls && msg.tool_calls.length > 0).length;

          spinner.succeed(`Completed in ${(duration / 1000).toFixed(1)}s`);

          // Display thinking if available and enabled
          const thinking = this.agent.getLastThinking();
          if (thinking && this.showThinking) {
            console.log(chalk.blue.bold('\n💭 Thinking:'));
            console.log(chalk.blue('─'.repeat(50)));
            console.log(chalk.blueBright(thinking));
            console.log(chalk.blue('─'.repeat(50)));
          }

          console.log(chalk.white('\n' + response));

          // Update stats
          this.updateStats(response, toolCallsMade);

          // Show quick stats if verbose
          if (this.verbose) {
            console.log(chalk.gray(`\n[Stats] Tokens (est.): ${Math.ceil(response.length / 4)} | Tools used: ${toolCallsMade} | Total saved: $${this.stats.claudeCostSaved.toFixed(4)}`));
          }

          console.log();
        } catch (error) {
          spinner.fail('Error occurred');
          console.error(chalk.red('\n❌ Error:'), error);
          console.log();
        }
      } catch (error) {
        console.log(chalk.red(`✗ Failed to load file: ${error instanceof Error ? error.message : String(error)}`));
      }
      return true;
    }

    if (trimmed === '/stats') {
      this.displayStats();
      return true;
    }

    if (trimmed === '/tools') {
      this.displayTools();
      return true;
    }

    if (trimmed === '/clear') {
      this.agent.clearHistory();
      console.log(chalk.green('✓ Conversation history cleared'));
      return true;
    }

    if (trimmed === '/reset') {
      this.stats = {
        totalRequests: 0,
        totalTokens: 0,
        toolCalls: 0,
        startTime: Date.now(),
        claudeCostSaved: 0
      };
      console.log(chalk.green('✓ Session statistics reset'));
      return true;
    }

    if (trimmed === '/exit' || trimmed === '/quit') {
      console.log(chalk.cyan.bold('\n👋 Goodbye! Thanks for using Ollama Code!'));
      this.displayStats();
      process.exit(0);
    }

    return false;
  }

  /**
   * Update statistics
   */
  private updateStats(response: string, toolCallCount: number = 0): void {
    this.stats.totalRequests++;

    // Estimate tokens (rough: 1 token ≈ 4 characters)
    const estimatedTokens = Math.ceil(response.length / 4);
    this.stats.totalTokens += estimatedTokens;
    this.stats.toolCalls += toolCallCount;

    // Calculate Claude cost savings ($3 per 1M tokens for Sonnet)
    this.stats.claudeCostSaved = (this.stats.totalTokens / 1_000_000) * 3.0;
  }

  /**
   * Execute a single command and exit (non-interactive mode)
   */
  async executeSingleCommand(prompt: string): Promise<void> {
    const initSpinner = ora('Initializing Ollama Code...').start();

    try {
      await this.initialize();
      initSpinner.succeed('Ready!');
    } catch (error) {
      initSpinner.fail('Initialization failed');
      console.error(chalk.red('Error during initialization:'), error);
      console.error(chalk.yellow('\nPlease check your configuration and try again.'));
      process.exit(1);
    }

    // Process the single command
    const spinner = ora({
      text: 'Processing...',
      spinner: 'dots'
    }).start();

    try {
      const startTime = Date.now();

      const response = await this.agent.run(prompt, {
        verbose: this.verbose,
      });

      const duration = Date.now() - startTime;
      spinner.succeed(`Completed in ${(duration / 1000).toFixed(1)}s`);

      // Display thinking if available and enabled
      const thinking = this.agent.getLastThinking();
      if (thinking && this.showThinking) {
        console.log(chalk.blue.bold('\n💭 Thinking:'));
        console.log(chalk.blue('─'.repeat(50)));
        console.log(chalk.blueBright(thinking));
        console.log(chalk.blue('─'.repeat(50)));
      }

      console.log(chalk.white('\n' + response + '\n'));

      // Exit cleanly
      process.exit(0);
    } catch (error) {
      spinner.fail('Error occurred');
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  }

  /**
   * Start REPL
   */
  async start(): Promise<void> {
    const initSpinner = ora('Initializing Ollama Code...').start();

    try {
      await this.initialize();
      initSpinner.succeed('Ready!');
    } catch (error) {
      initSpinner.fail('Initialization failed');
      console.error(chalk.red('Error during initialization:'), error);
      console.error(chalk.yellow('\nPlease check your configuration and try again.'));
      process.exit(1);
    }

    this.displayWelcome();

    // Keep the process alive
    const keepAlive = setInterval(() => {
      // Do nothing, just keep the event loop alive
    }, 1000 * 60 * 60); // Every hour

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        this.rl.prompt();
        return;
      }

      // Handle special commands
      const handled = await this.handleCommand(trimmed);
      if (handled) {
        this.rl.prompt();
        return;
      }

      // Process with agent
      const spinner = ora({
        text: 'Thinking...',
        spinner: 'dots'
      }).start();

      try {
        const startTime = Date.now();

        const response = await this.agent.run(trimmed, {
          verbose: this.verbose,
        });

        const duration = Date.now() - startTime;
        const history = this.agent.getHistory();
        const toolCallsMade = history.filter(msg => msg.tool_calls && msg.tool_calls.length > 0).length;

        spinner.succeed(`Completed in ${(duration / 1000).toFixed(1)}s`);

        // Display thinking if available and enabled
        const thinking = this.agent.getLastThinking();
        if (thinking && this.showThinking) {
          console.log(chalk.blue.bold('\n💭 Thinking:'));
          console.log(chalk.blue('─'.repeat(50)));
          console.log(chalk.blueBright(thinking));
          console.log(chalk.blue('─'.repeat(50)));
        }

        console.log(chalk.white('\n' + response));

        // Update stats
        this.updateStats(response, toolCallsMade);

        // Show quick stats if verbose
        if (this.verbose) {
          console.log(chalk.gray(`\n[Stats] Tokens (est.): ${Math.ceil(response.length / 4)} | Tools used: ${toolCallsMade} | Total saved: $${this.stats.claudeCostSaved.toFixed(4)}`));
        }

        console.log();
      } catch (error) {
        spinner.fail('Error occurred');
        console.error(chalk.red('\n❌ Error:'), error);
        console.log();
      }

      this.rl.prompt();
    });

    this.rl.on('close', () => {
      clearInterval(keepAlive);
      console.log(chalk.cyan.bold('\n👋 Goodbye!'));
      this.displayStats();
      // Clean exit
      process.exit(0);
    });

    // Prevent readline from closing on errors
    this.rl.on('error', (error) => {
      console.error(chalk.red('\n❌ Readline error:'), error);
      console.log(chalk.gray('Attempting to recover...'));
      this.rl.prompt();
    });

    // Handle SIGINT (Ctrl+C) gracefully with double-press to exit
    process.on('SIGINT', () => {
      const now = Date.now();
      if (now - this.lastSigintTime < 2000) {
        // Double SIGINT within 2 seconds - exit
        console.log(chalk.cyan.bold('\n\n👋 Goodbye!'));
        this.displayStats();
        process.exit(0);
      } else {
        // Single SIGINT - show warning
        this.lastSigintTime = now;
        console.log(chalk.yellow('\n\n🛑 Press Ctrl+C again within 2 seconds to exit, or type /exit'));
        this.rl.prompt();
      }
    });

    // Prevent immediate exit on SIGTERM
    process.on('SIGTERM', () => {
      console.log(chalk.yellow('\n\n🛑 Received SIGTERM. Exiting gracefully...'));
      this.rl.close();
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      console.error(chalk.red('\n❌ Unhandled Promise Rejection:'), reason);
      console.log(chalk.gray('The REPL will continue running. Please report this issue if it persists.\n'));
      this.rl.prompt();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error(chalk.red('\n❌ Uncaught Exception:'), error);
      console.log(chalk.gray('The REPL will continue running. Please report this issue if it persists.\n'));
      this.rl.prompt();
    });
  }
}
