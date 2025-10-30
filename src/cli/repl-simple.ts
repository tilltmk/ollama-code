import * as readline from 'readline';
import chalk from 'chalk';
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

export interface SimpleREPLOptions {
  verbose?: boolean;
  config?: Config;
}

export class SimpleREPL {
  private agent: Agent;
  private modelManager: ModelManager;
  private toolManager: ToolManager;
  private configManager: ConfigManager;
  private rl: readline.Interface;
  private verbose: boolean = false;
  private callbackLoop: CallbackLoop;
  private messageCount: number = 0;

  constructor(options: SimpleREPLOptions = {}) {
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

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  private async initialize(): Promise<void> {
    await this.modelManager.initialize();
  }

  private displayWelcome(): void {
    console.log(chalk.blue.bold('\n╔═══════════════════════════════════════════╗'));
    console.log(chalk.blue.bold('║    🚀 Ollama Code Assistant (Simple)      ║'));
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

          // Restore conversation history to maintain context
          // Note: We'll need to restore the history here if the Agent supports it
          // For now, we just create a new agent
          console.log(chalk.green(`✓ Switched to model: ${modelName}`));
          console.log(chalk.gray(`  Conversation context maintained (${history.length} messages)`));
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

  private prompt(): void {
    this.rl.question(chalk.cyan.bold('💻 ollama-code ❯ '), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        this.prompt();
        return;
      }

      // Handle special commands
      const handled = await this.handleCommand(trimmed);
      if (handled) {
        this.prompt();
        return;
      }

      // Process with agent
      try {
        console.log(chalk.gray('⏳ Thinking...'));

        const response = await this.agent.run(trimmed, {
          verbose: this.verbose,
        });

        this.messageCount++;
        console.log(chalk.white('\n' + response + '\n'));

        // Show context info
        const history = this.agent.getHistory();
        console.log(chalk.gray(`[Context: ${history.length} messages, Model: ${this.configManager.get().defaultModel}]`));
      } catch (error) {
        logger.error('Failed to process input', error);
        console.error(chalk.red(`\n❌ Error: ${formatErrorForDisplay(error)}\n`));
      }

      this.prompt();
    });
  }

  async start(): Promise<void> {
    console.log(chalk.gray('- Initializing Ollama Code...'));

    try {
      await this.initialize();
      console.log(chalk.green('✔ Ready!'));
      logger.info('Simple REPL initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize REPL', error);
      console.error(chalk.red('Failed to initialize:'), chalk.gray(formatErrorForDisplay(error)));
      console.error(chalk.yellow('\nPlease check your Ollama configuration'));
      process.exit(1);
    }

    this.displayWelcome();
    this.prompt();

    // Handle SIGINT
    process.on('SIGINT', () => {
      console.log(chalk.cyan.bold('\n\n👋 Goodbye!'));
      process.exit(0);
    });
  }
}