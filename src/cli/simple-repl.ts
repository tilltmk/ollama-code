#!/usr/bin/env node
import readline from 'readline';
import { Agent } from '../llm/agent.js';
import { ToolManager } from '../tools/tool-manager.js';
import { ModelManager } from '../llm/model-manager.js';
import { ConfigManager } from '../config/index.js';
import chalk from 'chalk';

export class SimpleREPL {
  private agent: Agent;
  private rl: readline.Interface;

  constructor() {
    const configManager = new ConfigManager();
    const config = configManager.get();
    const toolManager = new ToolManager();
    const modelManager = new ModelManager(config);
    this.agent = new Agent(config, toolManager, modelManager);

    // Use simpler readline setup
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async start() {
    console.log(chalk.cyan.bold('\n🤖 Ollama Code - Simple Mode\n'));
    console.log(chalk.gray('Type your message and press Enter. Type "exit" to quit.\n'));

    const prompt = () => {
      this.rl.question(chalk.cyan('> '), async (input) => {
        if (input.trim() === 'exit') {
          this.rl.close();
          process.exit(0);
        }

        if (!input.trim()) {
          prompt();
          return;
        }

        console.log(chalk.gray('\n⌛ Processing...\n'));

        try {
          const response = await this.agent.run(input, { verbose: false });
          console.log(chalk.white(response));
          console.log();
        } catch (error) {
          console.error(chalk.red('Error:'), error);
        }

        prompt();
      });
    };

    // Initialize and start prompting
    await this.initialize();
    prompt();
  }

  private async initialize() {
    try {
      const configManager = new ConfigManager();
      const config = configManager.get();
      const modelManager = new ModelManager(config);
      await modelManager.initialize();
      console.log(chalk.green('✓ Connected to Ollama'));
    } catch (error) {
      console.error(chalk.red('Failed to connect to Ollama:'), error);
      process.exit(1);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const repl = new SimpleREPL();
  repl.start().catch(console.error);
}