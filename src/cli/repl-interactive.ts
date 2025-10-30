import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { Agent } from '../llm/agent.js';
import { ModelManager } from '../llm/model-manager.js';
import { ToolManager } from '../tools/tool-manager.js';
import { ConfigManager } from '../config/index.js';
import { CallbackLoop } from '../llm/callback-loop.js';
import { setCallbackLoop } from '../tools/callback-tool.js';
import type { Config } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { formatErrorForDisplay } from '../utils/index.js';
import { COMMANDS } from '../constants/index.js';

export interface InteractiveREPLOptions {
  verbose?: boolean;
  config?: Config;
}

export class InteractiveREPL {
  private agent: Agent;
  private modelManager: ModelManager;
  private toolManager: ToolManager;
  private configManager: ConfigManager;
  private rl: readline.Interface | null = null;
  private verbose: boolean = false;
  private callbackLoop: CallbackLoop;
  private messageCount: number = 0;
  private isProcessing: boolean = false;
  private inputBuffer: string[] = [];
  private isPiped: boolean = false;

  constructor(options: InteractiveREPLOptions = {}) {
    this.verbose = options.verbose !== undefined ? options.verbose : true;
    this.configManager = new ConfigManager();

    if (options.config) {
      this.configManager.update(options.config);
    }

    const config = this.configManager.get();

    this.toolManager = new ToolManager();
    this.modelManager = new ModelManager(config);
    this.agent = new Agent(config, this.toolManager, this.modelManager);

    this.callbackLoop = new CallbackLoop(config, this.toolManager, this.modelManager, {
      verbose: this.verbose
    });

    setCallbackLoop(this.callbackLoop);

    // Detect if input is piped
    this.isPiped = !process.stdin.isTTY;
  }

  private async initialize(): Promise<void> {
    await this.modelManager.initialize();

    // Set system prompt that encourages tool use
    const systemPrompt = `You are a helpful coding assistant with access to powerful tools.

LANGUAGE: Always respond in the same language as the user's input. If the user writes in German, respond in German. If in English, respond in English.
SPRACHE: Antworte immer in der gleichen Sprache wie die Eingabe des Nutzers. Wenn der Nutzer auf Deutsch schreibt, antworte auf Deutsch.

IMPORTANT: You have access to the following tools that you SHOULD use when asked about files, code, or the filesystem:
- read_file: Read contents of files
- write_file: Write or create files
- edit_file: Modify existing files
- glob: Search for files by pattern (e.g. "*.js", "src/**/*.ts")
- grep: Search for text patterns in files
- bash: Execute shell commands

When the user asks about:
- "What files/folders do you see?" → Use glob tool with pattern "*" or "**/*"
- "Show me the code in X" → Use read_file tool
- "Search for X" → Use grep tool
- "Run command X" → Use bash tool

Always prefer using tools over saying "I cannot access files". You DO have access through these tools!

Current working directory: ${process.cwd()}`;

    this.agent.setSystemPrompt(systemPrompt);
  }

  private displayWelcome(): void {
    console.log(chalk.blue.bold('\n╔═══════════════════════════════════════════╗'));
    console.log(chalk.blue.bold('║    🚀 Ollama Code Assistant (Interactive)  ║'));
    console.log(chalk.blue.bold('╚═══════════════════════════════════════════╝'));
    console.log(chalk.gray('  100% Local • 100% Free • 100% Private\n'));

    console.log(chalk.yellow.bold('📦 Available Models:'));
    console.log(this.modelManager.getModelsSummary());

    console.log(chalk.green.bold(`\n✨ Current Model: ${this.configManager.get().defaultModel || 'auto'}`));
    console.log(chalk.gray(`🔗 Ollama URL: ${this.configManager.get().ollamaUrl}`));

    console.log(chalk.cyan.bold('\n⌨️  Commands:'));
    console.log(chalk.gray('  /help         Show this help'));
    console.log(chalk.gray('  /models       List available models'));
    console.log(chalk.gray('  /model <name> Change current model'));
    console.log(chalk.gray('  /clear        Clear conversation history'));
    console.log(chalk.gray('  /exit         Exit REPL'));
    console.log();
  }

  private async handleCommand(line: string): Promise<boolean> {
    const trimmed = line.trim().toLowerCase();

    if (trimmed === COMMANDS.HELP) {
      this.displayWelcome();
      return true;
    }

    if (trimmed === COMMANDS.MODELS) {
      console.log(chalk.yellow.bold('\n📦 Available Models:'));
      console.log(this.modelManager.getModelsSummary());
      return true;
    }

    if (trimmed.startsWith(COMMANDS.MODEL)) {
      const parts = line.split(' ');
      if (parts.length > 1) {
        const modelName = parts.slice(1).join(' ');
        if (this.modelManager.isModelAvailable(modelName)) {
          // Save current conversation history
          const history = this.agent.getHistory();

          // Update config and recreate agent with new model
          this.configManager.update({ defaultModel: modelName });
          const config = this.configManager.get();

          // Create new agent with the updated model
          this.agent = new Agent(config, this.toolManager, this.modelManager);

          // Re-apply the system prompt
          const systemPrompt = `You are a helpful coding assistant with access to powerful tools.

LANGUAGE: Always respond in the same language as the user's input. If the user writes in German, respond in German. If in English, respond in English.
SPRACHE: Antworte immer in der gleichen Sprache wie die Eingabe des Nutzers. Wenn der Nutzer auf Deutsch schreibt, antworte auf Deutsch.

IMPORTANT: You have access to the following tools that you SHOULD use when asked about files, code, or the filesystem:
- read_file: Read contents of files
- write_file: Write or create files
- edit_file: Modify existing files
- glob: Search for files by pattern (e.g. "*.js", "src/**/*.ts")
- grep: Search for text patterns in files
- bash: Execute shell commands

When the user asks about:
- "What files/folders do you see?" → Use glob tool with pattern "*" or "**/*"
- "Show me the code in X" → Use read_file tool
- "Search for X" → Use grep tool
- "Run command X" → Use bash tool

Always prefer using tools over saying "I cannot access files". You DO have access through these tools!

Current working directory: ${process.cwd()}`;

          this.agent.setSystemPrompt(systemPrompt);

          // Restore conversation history (excluding system message)
          const userMessages = history.filter(msg => msg.role !== 'system');
          userMessages.forEach(msg => {
            this.agent.getHistory().push(msg);
          });

          console.log(chalk.green(`✓ Switched to model: ${modelName}`));
          console.log(chalk.gray(`  Conversation context maintained (${userMessages.length} messages)`));
        } else {
          console.log(chalk.red(`✗ Model not available: ${modelName}`));
          console.log(chalk.yellow('Available models:'));
          console.log(this.modelManager.getModelsSummary());
        }
      } else {
        console.log(chalk.gray('Current model: ' + (this.configManager.get().defaultModel || 'auto')));
        console.log(chalk.gray('Usage: /model <model-name>'));
      }
      return true;
    }

    if (trimmed === COMMANDS.CLEAR) {
      // Clear conversation history
      this.agent.clearHistory();
      console.log(chalk.green('✓ Conversation history cleared'));
      return true;
    }

    if (trimmed === COMMANDS.EXIT || trimmed === COMMANDS.QUIT) {
      console.log(chalk.cyan.bold('\n👋 Goodbye!'));
      process.exit(0);
    }

    return false;
  }

  private async processInput(input: string): Promise<void> {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    // Handle special commands
    const handled = await this.handleCommand(trimmed);
    if (handled) {
      return;
    }

    // Process with agent
    try {
      const spinner = ora({
        text: chalk.cyan('Thinking...'),
        spinner: 'dots',
        color: 'cyan'
      }).start();

      const startTime = Date.now();
      const response = await this.agent.run(trimmed, {
        verbose: false, // Don't show verbose output in REPL
      });
      const duration = Date.now() - startTime;

      spinner.succeed(chalk.green(`Response in ${(duration / 1000).toFixed(1)}s`));

      this.messageCount++;

      // Format response with better line breaks
      console.log(chalk.gray('\n' + '─'.repeat(60)));
      console.log(chalk.white(response));
      console.log(chalk.gray('─'.repeat(60)));

      // Show context info
      const history = this.agent.getHistory();
      const modelName = this.configManager.get().defaultModel;
      console.log(chalk.dim(`\n📊 Context: ${history.length} messages | Model: ${modelName}\n`));
    } catch (error) {
      logger.error('Failed to process input', error);
      console.error(chalk.red(`\n❌ Error: ${formatErrorForDisplay(error)}\n`));
    }
  }

  private async processInputBuffer(): Promise<void> {
    if (this.isProcessing || this.inputBuffer.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.inputBuffer.length > 0) {
      const input = this.inputBuffer.shift()!;
      await this.processInput(input);

      // Show prompt after each response if in TTY mode
      if (!this.isPiped && this.rl) {
        this.rl.prompt();
      }
    }

    this.isProcessing = false;
  }

  private setupInteractiveMode(): void {
    // Create readline interface for interactive mode
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: chalk.cyan.bold('💻 ollama-code ❯ ')
    });

    this.rl.on('line', async (input) => {
      this.inputBuffer.push(input);
      await this.processInputBuffer();
    });

    this.rl.on('close', () => {
      console.log(chalk.cyan.bold('\n\n👋 Goodbye!'));
      process.exit(0);
    });

    // Show initial prompt
    this.rl.prompt();
  }

  private async setupPipedMode(): Promise<void> {
    // For piped mode, read all input line by line
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    console.log(chalk.gray('💻 Running in piped mode...\n'));

    rl.on('line', async (input) => {
      // Process each line immediately
      await this.processInput(input);
    });

    rl.on('close', () => {
      // Wait for any pending operations to complete
      setTimeout(() => {
        console.log(chalk.cyan.bold('\n👋 Session complete!'));
        process.exit(0);
      }, 500);
    });
  }

  async start(): Promise<void> {
    console.log(chalk.gray('- Initializing Ollama Code...'));

    try {
      await this.initialize();
      console.log(chalk.green('✔ Ready!'));
      logger.info('Interactive REPL initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize REPL', error);
      console.error(chalk.red('Failed to initialize:'), chalk.gray(formatErrorForDisplay(error)));
      console.error(chalk.yellow('\nPlease check your Ollama configuration'));
      process.exit(1);
    }

    this.displayWelcome();

    if (this.isPiped) {
      // Piped mode: process input line by line
      await this.setupPipedMode();
    } else {
      // Interactive mode: set up normal REPL
      this.setupInteractiveMode();
    }

    // Handle SIGINT
    process.on('SIGINT', () => {
      console.log(chalk.cyan.bold('\n\n👋 Goodbye!'));
      process.exit(0);
    });
  }
}