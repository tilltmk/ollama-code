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

  private getSystemPrompt(): string {
    return `You are a helpful coding assistant with direct access to the filesystem through tools.

CRITICAL RULES:
1. When asked to create/edit files → ACTUALLY USE THE TOOLS, don't just describe what you would do
2. When asked to search/read → USE glob/grep/read_file tools immediately
3. NEVER say "I will use tool X" - JUST USE IT
4. NEVER write pseudo-code like "bash: mkdir X" - USE THE ACTUAL TOOL

LANGUAGE: Always respond in the same language as the user's input.
SPRACHE: Antworte immer in der gleichen Sprache wie die Eingabe des Nutzers.

AVAILABLE TOOLS (you MUST use these when appropriate):
- write_file(filepath, content): Create or overwrite a file with content
- read_file(filepath): Read contents of a file
- edit_file(filepath, old_content, new_content): Modify existing files
- glob(pattern): Find files matching pattern (e.g. "*.js", "src/**/*.ts")
- grep(pattern, path): Search for text in files
- bash(command): Execute shell commands (mkdir, cd, ls, etc.)

WHEN TO USE TOOLS:
✓ User asks to create files → USE write_file immediately
✓ User asks to create directories → USE bash("mkdir -p ...") immediately
✓ User asks to see files → USE glob immediately
✓ User asks to read code → USE read_file immediately
✓ User asks about file content → USE read_file immediately
✓ User asks to search → USE grep immediately

EXAMPLES OF CORRECT BEHAVIOR:
User: "Create a file hello.py"
You: [USE write_file tool with actual content]
Then say: "Ich habe hello.py erstellt."

User: "Was ist in package.json?"
You: [USE read_file("package.json")]
Then explain the content.

User: "Create a Flask project in a folder"
You: [USE bash("mkdir -p project/templates project/static")]
Then: [USE write_file for each file]
Then say: "Ich habe das Projekt erstellt in /path/to/project"

WRONG BEHAVIOR (NEVER DO THIS):
❌ "Ich werde write_file benutzen..." → Just use it!
❌ "bash: mkdir project" → Use the actual tool!
❌ Describing what tools you would use → Just use them!

Current working directory: ${process.cwd()}

Remember: ACT, don't DESCRIBE. Use the tools immediately when needed!`;
  }

  private async initialize(): Promise<void> {
    // Register tools first
    const { fileTools, grepTool, bashTool, sqliteTools, httpTools, callbackLoopTools } = await import('../tools/index.js');

    const tools = [
      ...fileTools,
      grepTool,
      bashTool,
      ...sqliteTools,
      ...httpTools,
      ...callbackLoopTools,
    ];

    this.toolManager.registerTools(tools);

    // Initialize model manager and callback loop
    await this.modelManager.initialize();
    await this.callbackLoop.initialize();

    // Set system prompt
    this.agent.setSystemPrompt(this.getSystemPrompt());
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
          this.agent.setSystemPrompt(this.getSystemPrompt());

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


  private async processInteractiveInput(input: string): Promise<void> {
    const trimmed = input.trim();

    if (!trimmed) {
      if (this.rl && !(this.rl as any).closed) {
        this.rl.prompt();
      }
      return;
    }

    // Handle special commands
    const handled = await this.handleCommand(trimmed);
    if (handled) {
      if (this.rl && !(this.rl as any).closed) {
        this.rl.prompt();
      }
      return;
    }

    // Process with agent
    try {
      // Pause readline while processing to avoid interference
      if (this.rl) {
        this.rl.pause();
      }

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
    } finally {
      // Resume readline and show prompt
      if (this.rl && !(this.rl as any).closed) {
        this.rl.resume();
        this.rl.prompt();
      }
    }
  }

  private keepAliveInterval: NodeJS.Timeout | null = null;

  private setupInteractiveMode(): void {
    // Create readline interface for interactive mode FIRST
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: chalk.cyan.bold('💻 ollama-code ❯ ')
    });

    // CRITICAL: Keep event loop alive with interval
    this.keepAliveInterval = setInterval(() => {
      // Just keep the process alive
    }, 1000);

    this.rl.on('line', (input) => {
      logger.debug('Line event received', { input });

      // Process in setImmediate to avoid blocking the event loop
      setImmediate(() => {
        this.processInteractiveInput(input).catch((error) => {
          logger.error('Error processing input', error);
          console.error(chalk.red(`\n❌ Error: ${formatErrorForDisplay(error)}\n`));
          if (this.rl && !(this.rl as any).closed) {
            this.rl.prompt();
          }
        });
      });
    });

    this.rl.on('close', () => {
      logger.info('Readline close event - cleaning up');
      if (this.keepAliveInterval) {
        clearInterval(this.keepAliveInterval);
      }
      if (!this.isPiped) {
        console.log(chalk.cyan.bold('\n\n👋 Goodbye!'));
        process.exit(0);
      }
    });

    this.rl.on('SIGINT', () => {
      if (this.keepAliveInterval) {
        clearInterval(this.keepAliveInterval);
      }
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

    const inputLines: string[] = [];
    let processing = false;

    const processNextLine = async () => {
      if (processing || inputLines.length === 0) {
        return;
      }

      processing = true;
      const input = inputLines.shift()!;

      // Check if this is the exit command
      const trimmed = input.trim().toLowerCase();
      if (trimmed === COMMANDS.EXIT || trimmed === COMMANDS.QUIT) {
        console.log(chalk.cyan.bold('\n👋 Goodbye!'));
        process.exit(0);
      }

      // Process the input
      await this.processInput(input);

      processing = false;

      // Process next line if available
      if (inputLines.length > 0) {
        // Small delay to allow output to be displayed
        setTimeout(processNextLine, 100);
      }
    };

    rl.on('line', (input) => {
      // Queue the input
      inputLines.push(input);
      // Start processing if not already doing so
      processNextLine();
    });

    rl.on('close', () => {
      // Wait for any pending operations to complete
      const checkComplete = () => {
        if (inputLines.length === 0 && !processing) {
          console.log(chalk.cyan.bold('\n👋 Session complete!'));
          process.exit(0);
        } else {
          setTimeout(checkComplete, 500);
        }
      };
      setTimeout(checkComplete, 500);
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

    // Catch any unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason);
      // Don't exit, just log the error and keep running
      console.error(chalk.yellow('\n⚠️  An error occurred but REPL continues running'));
      if (this.rl && !this.isPiped) {
        this.rl.prompt();
      }
    });
  }
}