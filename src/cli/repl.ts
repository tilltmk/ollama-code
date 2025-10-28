import * as readline from 'readline';
import chalk from 'chalk';
import { Agent } from '../llm/agent.js';
import { ModelManager } from '../llm/model-manager.js';
import { ToolManager } from '../tools/tool-manager.js';
import { ConfigManager } from '../config/index.js';
import { allTools } from '../tools/index.js';
import type { Config } from '../types/index.js';

export interface REPLOptions {
  verbose?: boolean;
  config?: Config;
}

export class REPL {
  private agent: Agent;
  private modelManager: ModelManager;
  private toolManager: ToolManager;
  private configManager: ConfigManager;
  private rl: readline.Interface;
  private verbose: boolean = false;

  constructor(options: REPLOptions = {}) {
    this.verbose = options.verbose || false;
    this.configManager = new ConfigManager();

    // Use provided config or default
    if (options.config) {
      this.configManager.update(options.config);
    }

    this.toolManager = new ToolManager();
    this.modelManager = new ModelManager(this.configManager.get());
    this.agent = new Agent(
      this.configManager.get(),
      this.toolManager,
      this.modelManager
    );
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('ollama-code> '),
    });
  }

  /**
   * Initialize REPL
   */
  async initialize(): Promise<void> {
    // Load configuration
    await this.configManager.load();

    // Register all tools
    this.toolManager.registerTools(allTools);

    // Initialize model manager
    await this.modelManager.initialize();

    // Set system prompt
    const systemPrompt = `You are a helpful coding assistant powered by local Ollama models.
You have access to file operations, code search, and bash execution tools.
Always use the tools to interact with the filesystem and execute commands.
Be concise and helpful. When writing code, ensure it's correct and follows best practices.`;

    this.agent.setSystemPrompt(systemPrompt);
  }

  /**
   * Display welcome message
   */
  displayWelcome(): void {
    console.log(chalk.bold.cyan('\n=== Ollama Code Assistant ==='));
    console.log(chalk.gray('Powered by local Ollama models\n'));

    const modelsSummary = this.modelManager.getModelsSummary();
    console.log(chalk.yellow('Available models:'));
    console.log(modelsSummary);

    const config = this.configManager.get();
    const currentModel = this.modelManager.selectModelForTask('code');
    console.log(chalk.green(`\nCurrent model: ${currentModel}`));
    console.log(chalk.gray(`Ollama URL: ${config.ollamaUrl}\n`));

    console.log(chalk.gray('Commands:'));
    console.log(chalk.gray('  /help     - Show help'));
    console.log(chalk.gray('  /models   - List available models'));
    console.log(chalk.gray('  /model    - Change current model'));
    console.log(chalk.gray('  /verbose  - Toggle verbose mode'));
    console.log(chalk.gray('  /clear    - Clear conversation history'));
    console.log(chalk.gray('  /exit     - Exit REPL\n'));
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
      console.log(chalk.yellow('\nAvailable models:'));
      console.log(this.modelManager.getModelsSummary());
      return true;
    }

    if (trimmed.startsWith('/model')) {
      const parts = line.split(' ');
      if (parts.length > 1) {
        const modelName = parts.slice(1).join(' ');
        if (this.modelManager.isModelAvailable(modelName)) {
          this.configManager.update({ defaultModel: modelName });
          console.log(chalk.green(`Switched to model: ${modelName}`));
        } else {
          console.log(chalk.red(`Model not available: ${modelName}`));
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
      console.log(chalk.yellow(`Verbose mode: ${this.verbose ? 'ON' : 'OFF'}`));
      return true;
    }

    if (trimmed === '/clear') {
      this.agent.clearHistory();
      console.log(chalk.gray('Conversation history cleared'));
      return true;
    }

    if (trimmed === '/exit' || trimmed === '/quit') {
      console.log(chalk.cyan('\nGoodbye!'));
      process.exit(0);
    }

    return false;
  }

  /**
   * Start REPL
   */
  async start(): Promise<void> {
    await this.initialize();
    this.displayWelcome();

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
      try {
        console.log(chalk.gray('\nThinking...\n'));

        const response = await this.agent.run(trimmed, {
          verbose: this.verbose,
        });

        console.log(chalk.white(response));
        console.log();
      } catch (error) {
        console.error(chalk.red('\nError:'), error);
        console.log();
      }

      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log(chalk.cyan('\nGoodbye!'));
      process.exit(0);
    });
  }
}
