#!/usr/bin/env node

import { Command } from 'commander';
import { EnhancedREPL } from './cli/repl-enhanced.js';
import chalk from 'chalk';
import { OllamaClient } from './llm/ollama-client.js';
import { ConfigManager } from './config/index.js';

const program = new Command();

program
  .name('ollama-code')
  .description('Local code assistant powered by Ollama with Qwen and GPT-OSS models')
  .version('0.1.0');

program
  .command('chat', { isDefault: true })
  .description('Start interactive chat REPL')
  .option('-m, --model <model>', 'Model to use (e.g., qwen3-coder:30b, gpt-oss:20b)')
  .option('-v, --verbose', 'Enable verbose output (show tool calls)')
  .option('--url <url>', 'Ollama server URL (default: http://localhost:11434)')
  .option('-t, --temperature <number>', 'Temperature for generation (0.0-1.0)', parseFloat)
  .action(async (options) => {
    // Health check
    const ollamaUrl = options.url || process.env.OLLAMA_URL || 'http://localhost:11434';
    const client = new OllamaClient(ollamaUrl);
    const isHealthy = await client.healthCheck();

    if (!isHealthy) {
      console.error(chalk.red('Error: Cannot connect to Ollama server'));
      console.error(chalk.gray(`Tried: ${ollamaUrl}`));
      console.error(chalk.gray('\nPlease ensure Ollama is running:'));
      console.error(chalk.gray('  ollama serve'));
      console.error(chalk.gray('\nOr check if Ollama is installed:'));
      console.error(chalk.gray('  https://ollama.ai'));
      process.exit(1);
    }

    // Apply options to config
    const configManager = new ConfigManager();
    await configManager.load();

    if (options.model) {
      configManager.update({ defaultModel: options.model });
    }
    if (options.url) {
      configManager.update({ ollamaUrl: options.url });
    }
    if (options.temperature !== undefined) {
      configManager.update({ temperature: options.temperature });
    }

    const repl = new EnhancedREPL({
      verbose: options.verbose || false,
      config: configManager.get()
    });
    await repl.start();
  });

program
  .command('models')
  .description('List available Ollama models')
  .action(async () => {
    const client = new OllamaClient();
    try {
      const response = await client.listModels();
      console.log(chalk.yellow('\nAvailable Ollama models:\n'));
      for (const model of response.models) {
        const size = (model.size / 1024 / 1024 / 1024).toFixed(2);
        console.log(chalk.cyan(`  ${model.name}`));
        console.log(chalk.gray(`    Size: ${size} GB`));
        console.log(chalk.gray(`    Modified: ${model.modified_at}`));
        console.log();
      }
    } catch (error) {
      console.error(chalk.red('Error listing models:'), error);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Check Ollama server health')
  .action(async () => {
    const client = new OllamaClient();
    const isHealthy = await client.healthCheck();

    if (isHealthy) {
      console.log(chalk.green('✓ Ollama server is running'));
      const response = await client.listModels();
      console.log(chalk.gray(`  ${response.models.length} models available`));
    } else {
      console.log(chalk.red('✗ Ollama server is not accessible'));
      process.exit(1);
    }
  });

program.parse();
