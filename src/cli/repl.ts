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
import { logger } from '../utils/logger.js';
import { formatErrorForDisplay, estimateTokens, calculateCostSavings, formatDuration } from '../utils/index.js';
import { UI, DEFAULTS, COMMANDS, TOOL_CATEGORIES, DISPLAY } from '../constants/index.js';

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

export class REPL {
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
  private multilineMode: boolean = false;
  private multilineBuffer: string[] = [];

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
      prompt: chalk.cyan.bold(UI.PROMPTS.REPL),
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
    console.log(chalk.bold.cyan(`║    🚀 ${UI.MESSAGES.WELCOME}   ║`));
    console.log(chalk.bold.cyan('╚═══════════════════════════════════════════╝'));
    console.log(chalk.gray(`  ${UI.MESSAGES.WELCOME_SUBTITLE}\n`));

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
    console.log(chalk.gray(`  Claude API cost: ~$${DEFAULTS.COST.CLAUDE_PER_MILLION_TOKENS.toFixed(2)} per 1M tokens`));
    console.log(chalk.gray(`  Ollama cost: $0.00 (100% local)`));
    console.log(chalk.green.bold(`  You save: $${DEFAULTS.COST.CLAUDE_PER_MILLION_TOKENS.toFixed(2)} per 1M tokens!\n`));

    console.log(chalk.magenta.bold('⌨️  Commands:'));
    console.log(chalk.gray(`  ${COMMANDS.HELP}         Show this help`));
    console.log(chalk.gray(`  ${COMMANDS.MODELS}       List available models`));
    console.log(chalk.gray(`  ${COMMANDS.MODEL}        Change current model`));
    console.log(chalk.gray(`  ${COMMANDS.VERBOSE}      Toggle verbose mode`));
    console.log(chalk.gray(`  ${COMMANDS.THINKING}     Toggle thinking display`));
    console.log(chalk.gray(`  ${COMMANDS.MD}           Enter multi-line markdown mode`));
    console.log(chalk.gray(`  ${COMMANDS.LOAD} <file>  Load and process MD file`));
    console.log(chalk.gray(`  ${COMMANDS.STATS}        Show session statistics`));
    console.log(chalk.gray(`  ${COMMANDS.TOOLS}        Show available tools`));
    console.log(chalk.gray(`  ${COMMANDS.CLEAR}        Clear conversation history`));
    console.log(chalk.gray(`  ${COMMANDS.RESET}        Reset session stats`));
    console.log(chalk.gray(`  ${COMMANDS.EXIT}         Exit REPL\n`));
  }

  /**
   * Display session statistics
   */
  private displayStats(): void {
    const sessionDuration = (Date.now() - this.stats.startTime) / 1000;
    const minutes = Math.floor(sessionDuration / 60);
    const seconds = Math.floor(sessionDuration % 60);

    console.log(chalk.cyan.bold('\n📊 Session Statistics'));
    console.log(chalk.gray(DISPLAY.SEPARATOR.repeat(DISPLAY.LINE_LENGTH)));
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
    console.log(chalk.gray(DISPLAY.SEPARATOR.repeat(DISPLAY.LINE_LENGTH)));

    const categories = {
      'File Operations': tools.filter(t => (TOOL_CATEGORIES.FILE_OPERATIONS as readonly string[]).includes(t.name)),
      'Code Search': tools.filter(t => t.name === 'grep'),
      'System': tools.filter(t => t.name === 'bash'),
      'Multi-Agent': tools.filter(t => t.name === 'delegate_to_subagents'),
      'Database': tools.filter(t => TOOL_CATEGORIES.DATABASE(t.name)),
      'HTTP': tools.filter(t => TOOL_CATEGORIES.HTTP(t.name)),
      'Workflow': tools.filter(t => TOOL_CATEGORIES.WORKFLOW(t.name))
    };

    for (const [category, categoryTools] of Object.entries(categories)) {
      if (categoryTools.length > 0) {
        console.log(chalk.yellow.bold(`\n  ${category}:`));
        categoryTools.forEach(tool => {
          console.log(chalk.gray(`    • ${tool.name.padEnd(DISPLAY.TOOL_NAME_WIDTH)} ${tool.description.substring(0, DISPLAY.TOOL_DESC_MAX_LENGTH)}...`));
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
          this.configManager.update({ defaultModel: modelName });
          console.log(chalk.green(`${UI.ICONS.CHECK} Switched to model: ${modelName}`));
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

    if (trimmed === COMMANDS.VERBOSE) {
      this.verbose = !this.verbose;
      console.log(chalk.yellow(`🔊 Verbose mode: ${this.verbose ? chalk.green('ON') : chalk.red('OFF')}`));
      return true;
    }

    if (trimmed === COMMANDS.THINKING) {
      this.showThinking = !this.showThinking;
      console.log(chalk.yellow(`🧠 Thinking display: ${this.showThinking ? chalk.green('ON') : chalk.red('OFF')}`));
      return true;
    }

    if (trimmed === COMMANDS.MD || trimmed === COMMANDS.MULTILINE) {
      this.enterMultilineMode();
      return true;
    }

    if (trimmed.startsWith(COMMANDS.LOAD)) {
      const parts = line.split(' ');
      if (parts.length < 2) {
        console.log(chalk.red(`✗ Usage: ${COMMANDS.LOAD} <file>`));
        return true;
      }
      const filePath = parts.slice(1).join(' ').trim();

      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const resolvedPath = path.resolve(filePath);
        const content = await fs.readFile(resolvedPath, 'utf-8');

        // Process the file content as a prompt
        console.log(chalk.green(`${UI.ICONS.CHECK} Loaded ${filePath} (${content.length} chars)`));
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

          spinner.succeed(`Completed in ${formatDuration(duration)}`);

          // Display thinking if available and enabled
          const thinking = this.agent.getLastThinking();
          if (thinking && this.showThinking) {
            this.displayThinking(thinking);
          }

          console.log(chalk.white('\n' + response));

          // Update stats
          this.updateStats(response, toolCallsMade);

          // Show detailed stats if verbose
          if (this.verbose) {
            this.displayDetailedStats(response, duration, toolCallsMade);
          }

          console.log();
        } catch (error) {
          spinner.fail('Error occurred');
          logger.error('Failed to process file content', error);
          console.error(chalk.red('\n' + UI.ICONS.ERROR + ' Error:'), chalk.gray(formatErrorForDisplay(error)));
          console.log();
        }
      } catch (error) {
        logger.error('Failed to load file', error, { filePath });
        console.log(chalk.red(`✗ Failed to load file: ${formatErrorForDisplay(error)}`));
      }
      return true;
    }

    if (trimmed === COMMANDS.STATS) {
      this.displayStats();
      return true;
    }

    if (trimmed === COMMANDS.TOOLS) {
      this.displayTools();
      return true;
    }

    if (trimmed === COMMANDS.CLEAR) {
      this.agent.clearHistory();
      console.log(chalk.green(`${UI.ICONS.CHECK} Conversation history cleared`));
      return true;
    }

    if (trimmed === COMMANDS.RESET) {
      this.stats = {
        totalRequests: 0,
        totalTokens: 0,
        toolCalls: 0,
        startTime: Date.now(),
        claudeCostSaved: 0
      };
      console.log(chalk.green(`${UI.ICONS.CHECK} Session statistics reset`));
      return true;
    }

    if (trimmed === COMMANDS.EXIT || trimmed === COMMANDS.QUIT) {
      console.log(chalk.cyan.bold(`\n${UI.MESSAGES.GOODBYE}! Thanks for using Ollama Code!`));
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

    // Estimate tokens
    const estimatedTokens = estimateTokens(response, DEFAULTS.COST.TOKENS_PER_CHAR);
    this.stats.totalTokens += estimatedTokens;
    this.stats.toolCalls += toolCallCount;

    // Calculate Claude cost savings
    this.stats.claudeCostSaved = calculateCostSavings(this.stats.totalTokens, DEFAULTS.COST.CLAUDE_PER_MILLION_TOKENS);
  }

  /**
   * Display detailed stats after a request
   */
  private displayDetailedStats(response: string, duration: number, toolCallsMade: number): void {
    const tokens = estimateTokens(response, DEFAULTS.COST.TOKENS_PER_CHAR);
    const tokensPerSec = Math.round(tokens / (duration / 1000));
    const costSaved = calculateCostSavings(tokens, DEFAULTS.COST.CLAUDE_PER_MILLION_TOKENS);

    const boxWidth = 70;
    console.log(chalk.gray('\n' + DISPLAY.SEPARATOR.repeat(boxWidth)));
    console.log(chalk.cyan.bold('📊 Request Statistics'));
    console.log(chalk.gray(DISPLAY.SEPARATOR.repeat(boxWidth)));

    // Performance metrics
    console.log(chalk.yellow('  ⚡ Performance:'));
    console.log(chalk.gray(`     • Response time: ${(duration / 1000).toFixed(2)}s`));
    console.log(chalk.gray(`     • Speed: ~${tokensPerSec} tokens/sec`));

    // Token usage
    console.log(chalk.yellow('\n  🔤 Token Usage:'));
    console.log(chalk.gray(`     • This request: ${tokens.toLocaleString()} tokens`));
    console.log(chalk.gray(`     • Session total: ${this.stats.totalTokens.toLocaleString()} tokens`));

    // Tool usage
    if (toolCallsMade > 0) {
      console.log(chalk.yellow('\n  🔧 Tool Usage:'));
      console.log(chalk.gray(`     • Tools called: ${toolCallsMade}`));
      console.log(chalk.gray(`     • Session total: ${this.stats.toolCalls} tool calls`));
    }

    // Cost savings
    console.log(chalk.yellow('\n  💰 Cost Savings (vs Claude Sonnet):'));
    console.log(chalk.green(`     • This request: $${costSaved.toFixed(6)} saved`));
    console.log(chalk.green(`     • Session total: $${this.stats.claudeCostSaved.toFixed(4)} saved`));

    console.log(chalk.gray(DISPLAY.SEPARATOR.repeat(boxWidth)));
  }

  /**
   * Display thinking in an elegant format
   */
  private displayThinking(thinking: string): void {
    const terminalWidth = process.stdout.columns || 80;
    const boxWidth = Math.min(terminalWidth - 4, 80);

    console.log(chalk.blue.bold('\n╔═' + '═'.repeat(boxWidth - 2) + '═╗'));
    console.log(chalk.blue.bold('║') + chalk.cyan.bold(` ${UI.ICONS.THINKING} ${UI.PROMPTS.THINKING}`.padEnd(boxWidth, ' ')) + chalk.blue.bold('║'));
    console.log(chalk.blue.bold('╠═' + '═'.repeat(boxWidth - 2) + '═╣'));

    // Wrap and display thinking content
    const lines = thinking.split('\n');
    for (const line of lines) {
      if (line.length <= boxWidth - 4) {
        console.log(chalk.blue.bold('║ ') + chalk.blueBright(line.padEnd(boxWidth - 2, ' ')) + chalk.blue.bold('║'));
      } else {
        // Word wrap long lines
        const words = line.split(' ');
        let currentLine = '';
        for (const word of words) {
          if ((currentLine + word).length <= boxWidth - 4) {
            currentLine += (currentLine ? ' ' : '') + word;
          } else {
            console.log(chalk.blue.bold('║ ') + chalk.blueBright(currentLine.padEnd(boxWidth - 2, ' ')) + chalk.blue.bold('║'));
            currentLine = word;
          }
        }
        if (currentLine) {
          console.log(chalk.blue.bold('║ ') + chalk.blueBright(currentLine.padEnd(boxWidth - 2, ' ')) + chalk.blue.bold('║'));
        }
      }
    }

    console.log(chalk.blue.bold('╚═' + '═'.repeat(boxWidth - 2) + '═╝'));
  }

  /**
   * Enter multiline mode for MD input
   */
  private enterMultilineMode(): void {
    this.multilineMode = true;
    this.multilineBuffer = [];
    console.log(chalk.yellow.bold('\n📝 Multi-line Mode Activated'));
    console.log(chalk.gray('  • Enter your markdown content'));
    console.log(chalk.gray(`  • Type ${COMMANDS.END} on a new line to finish`));
    console.log(chalk.gray(`  • Type ${COMMANDS.CANCEL} to abort\n`));
    this.rl.setPrompt(chalk.cyan(`  ${UI.ICONS.PIPE} `));
    this.rl.prompt();
  }

  /**
   * Process multiline buffer
   */
  private async processMultilineBuffer(): Promise<void> {
    const content = this.multilineBuffer.join('\n');
    this.multilineMode = false;
    this.multilineBuffer = [];
    this.rl.setPrompt(chalk.cyan.bold(UI.PROMPTS.REPL));

    console.log(chalk.green(`${UI.ICONS.CHECK} Received ${content.length} characters`));
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

      spinner.succeed(`Completed in ${formatDuration(duration)}`);

      // Display thinking if available and enabled
      const thinking = this.agent.getLastThinking();
      if (thinking && this.showThinking) {
        this.displayThinking(thinking);
      }

      console.log(chalk.white('\n' + response));

      // Update stats
      this.updateStats(response, toolCallsMade);

      // Show detailed stats if verbose
      if (this.verbose) {
        this.displayDetailedStats(response, duration, toolCallsMade);
      }

      console.log();
    } catch (error) {
      spinner.fail('Error occurred');
      logger.error('Failed to process multiline buffer', error);
      console.error(chalk.red('\n' + UI.ICONS.ERROR + ' Error:'), chalk.gray(formatErrorForDisplay(error)));
      console.log();
    }
  }

  /**
   * Execute a single command and exit (non-interactive mode)
   */
  async executeSingleCommand(prompt: string): Promise<void> {
    const initSpinner = ora('Initializing Ollama Code...').start();

    try {
      await this.initialize();
      initSpinner.succeed(UI.MESSAGES.INITIALIZED);
      logger.info('Single command mode initialized');
    } catch (error) {
      initSpinner.fail(UI.MESSAGES.INIT_FAILED);
      logger.error('Failed to initialize in single command mode', error);
      console.error(chalk.red(UI.MESSAGES.ERROR_DURING_INIT), chalk.gray(formatErrorForDisplay(error)));
      console.error(chalk.yellow(`\n${UI.MESSAGES.CHECK_CONFIG}`));
      process.exit(1);
    }

    // Process the single command with verbose output
    console.log(chalk.cyan('\n🚀 Starting execution...\n'));

    try {
      const startTime = Date.now();

      const response = await this.agent.run(prompt, {
        verbose: true, // Always show verbose output in single-command mode
        maxIterations: DEFAULTS.AGENT.MAX_ITERATIONS,
      });

      const duration = Date.now() - startTime;
      console.log(chalk.green(`\n${UI.ICONS.COST_SAVED} Completed in ${formatDuration(duration)}`));

      // Display thinking if available and enabled
      const thinking = this.agent.getLastThinking();
      if (thinking && this.showThinking) {
        this.displayThinking(thinking);
      }

      console.log(chalk.white('\n' + response + '\n'));

      // Exit cleanly
      logger.info('Single command execution completed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Single command execution failed', error);
      console.error(chalk.red(`\n${UI.ICONS.ERROR} Error occurred:`), chalk.gray(formatErrorForDisplay(error)));
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
      initSpinner.succeed(UI.MESSAGES.INITIALIZED);
      logger.info('REPL initialized successfully');
    } catch (error) {
      initSpinner.fail(UI.MESSAGES.INIT_FAILED);
      logger.error('Failed to initialize REPL', error);
      console.error(chalk.red(UI.MESSAGES.ERROR_DURING_INIT), chalk.gray(formatErrorForDisplay(error)));
      console.error(chalk.yellow(`\n${UI.MESSAGES.CHECK_CONFIG}`));
      process.exit(1);
    }

    this.displayWelcome();

    // Keep the process alive
    const keepAlive = setInterval(() => {
      // Do nothing, just keep the event loop alive
    }, DEFAULTS.SIGINT.KEEPALIVE_INTERVAL);

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const trimmed = line.trim();

      // Handle multiline mode
      if (this.multilineMode) {
        if (trimmed === COMMANDS.END) {
          await this.processMultilineBuffer();
          this.rl.prompt();
          return;
        } else if (trimmed === COMMANDS.CANCEL) {
          this.multilineMode = false;
          this.multilineBuffer = [];
          this.rl.setPrompt(chalk.cyan.bold(UI.PROMPTS.REPL));
          console.log(chalk.yellow('✗ Multi-line input cancelled'));
          this.rl.prompt();
          return;
        } else {
          this.multilineBuffer.push(line);
          this.rl.prompt();
          return;
        }
      }

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

        spinner.succeed(`Completed in ${formatDuration(duration)}`);

        // Display thinking if available and enabled
        const thinking = this.agent.getLastThinking();
        if (thinking && this.showThinking) {
          this.displayThinking(thinking);
        }

        console.log(chalk.white('\n' + response));

        // Update stats
        this.updateStats(response, toolCallsMade);

        // Show detailed stats if verbose
        if (this.verbose) {
          this.displayDetailedStats(response, duration, toolCallsMade);
        }

        console.log();
      } catch (error) {
        spinner.fail('Error occurred');
        logger.error('Failed to process user input', error);
        console.error(chalk.red(`\n${UI.ICONS.ERROR} Error:`), chalk.gray(formatErrorForDisplay(error)));
        console.log();
      }

      this.rl.prompt();
    });

    this.rl.on('close', () => {
      clearInterval(keepAlive);
      logger.info('REPL session ended');
      console.log(chalk.cyan.bold(`\n${UI.MESSAGES.GOODBYE}!`));
      this.displayStats();
      // Clean exit
      process.exit(0);
    });

    // Prevent readline from closing on errors
    this.rl.on('error', (error) => {
      logger.error('Readline error', error);
      console.error(chalk.red(`\n${UI.ICONS.ERROR} Readline error:`), chalk.gray(formatErrorForDisplay(error)));
      console.log(chalk.gray('Attempting to recover...'));
      this.rl.prompt();
    });

    // Handle SIGINT (Ctrl+C) gracefully with double-press to exit
    process.on('SIGINT', () => {
      const now = Date.now();
      if (now - this.lastSigintTime < DEFAULTS.SIGINT.DOUBLE_PRESS_WINDOW) {
        // Double SIGINT within window - exit
        logger.info('REPL terminated by user (Ctrl+C)');
        console.log(chalk.cyan.bold(`\n\n${UI.MESSAGES.GOODBYE}!`));
        this.displayStats();
        process.exit(0);
      } else {
        // Single SIGINT - show warning
        this.lastSigintTime = now;
        logger.debug('Single SIGINT received');
        console.log(chalk.yellow(`\n\n🛑 Press Ctrl+C again within ${DEFAULTS.SIGINT.DOUBLE_PRESS_WINDOW / 1000}s to exit, or type ${COMMANDS.EXIT}`));
        this.rl.prompt();
      }
    });

    // Prevent immediate exit on SIGTERM
    process.on('SIGTERM', () => {
      logger.warn('SIGTERM received, exiting gracefully');
      console.log(chalk.yellow('\n\n🛑 Received SIGTERM. Exiting gracefully...'));
      this.rl.close();
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Promise Rejection', reason);
      console.error(chalk.red(`\n${UI.ICONS.ERROR} Unhandled Promise Rejection:`), chalk.gray(formatErrorForDisplay(reason)));
      console.log(chalk.gray('The REPL will continue running. Please report this issue if it persists.\n'));
      this.rl.prompt();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      console.error(chalk.red(`\n${UI.ICONS.ERROR} Uncaught Exception:`), chalk.gray(formatErrorForDisplay(error)));
      console.log(chalk.gray('The REPL will continue running. Please report this issue if it persists.\n'));
      this.rl.prompt();
    });
  }
}
