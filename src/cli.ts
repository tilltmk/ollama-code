#!/usr/bin/env node

import { Command } from 'commander';
import { SimpleREPL } from './cli/repl-simple.js';
import chalk from 'chalk';
import { OllamaClient } from './llm/ollama-client.js';
import { ConfigManager } from './config/index.js';
import { logger } from './utils/logger.js';
import { NetworkError, formatErrorForDisplay } from './utils/errors.js';

const program = new Command();

program
  .name('ollama-code')
  .description('Local code assistant powered by Ollama with Qwen and GPT-OSS models')
  .version('0.1.0');

program
  .command('chat', { isDefault: true })
  .description('Start interactive chat REPL or execute a single command')
  .argument('[prompt...]', 'Optional prompt to execute (if provided, runs once and exits)')
  .option('-m, --model <model>', 'Model to use (e.g., qwen3-coder:30b, gpt-oss:20b)')
  .option('-v, --verbose', 'Enable verbose output (show tool calls, enabled by default)')
  .option('-q, --quiet', 'Disable verbose output')
  .option('--enable-subagents', 'Enable sub-agent delegation (disabled by default)')
  .option('--url <url>', 'Ollama server URL (default: http://localhost:11434)')
  .option('-t, --temperature <number>', 'Temperature for generation (0.0-1.0)', parseFloat)
  .action(async (promptArgs: string[], options) => {
    // Health check
    const ollamaUrl = options.url || process.env.OLLAMA_URL || 'http://localhost:11434';
    const client = new OllamaClient(ollamaUrl);

    try {
      const isHealthy = await client.healthCheck();

      if (!isHealthy) {
        const error = new NetworkError('Cannot connect to Ollama server', ollamaUrl);
        logger.error('Ollama connection failed', error, { url: ollamaUrl });

        console.error(chalk.red(`Error: ${error.message}`));
        console.error(chalk.gray(`Tried: ${ollamaUrl}`));
        console.error(chalk.gray('\nPlease ensure Ollama is running:'));
        console.error(chalk.gray('  ollama serve'));
        console.error(chalk.gray('\nOr check if Ollama is installed:'));
        console.error(chalk.gray('  https://ollama.ai'));
        process.exit(1);
      }

      logger.info('Connected to Ollama server', { url: ollamaUrl });
    } catch (error) {
      const networkError = new NetworkError('Failed to connect to Ollama server', ollamaUrl);
      logger.error('Ollama health check failed', error, { url: ollamaUrl });

      console.error(chalk.red(formatErrorForDisplay(networkError)));
      console.error(chalk.gray(`URL: ${ollamaUrl}`));
      console.error(chalk.gray('\nPlease ensure Ollama is running and accessible.'));
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

    // Determine verbose mode: default is true unless --quiet is specified
    const verbose = options.quiet ? false : true;

    const repl = new SimpleREPL({
      verbose,
      config: configManager.get()
    });

    // Check if prompt was provided
    const prompt = promptArgs.join(' ').trim();
    if (prompt) {
      // Single-shot mode: execute and exit
      // For now, we'll use the simple REPL's agent directly
      console.log(chalk.yellow('🚀 Starting execution...'));
      const { Agent } = await import('./llm/agent.js');
      const { ModelManager } = await import('./llm/model-manager.js');
      const { ToolManager } = await import('./tools/tool-manager.js');

      const toolManager = new ToolManager();
      const modelManager = new ModelManager(configManager.get());
      const agent = new Agent(configManager.get(), toolManager, modelManager);

      await modelManager.initialize();

      try {
        const response = await agent.run(prompt, { verbose });
        console.log(chalk.white('\n' + response));
      } catch (error) {
        console.error(chalk.red(`\n❌ Error: ${formatErrorForDisplay(error)}`));
        process.exit(1);
      }
    } else {
      // Interactive REPL mode
      await repl.start();
    }
  });

program
  .command('models')
  .description('List available Ollama models')
  .action(async () => {
    const client = new OllamaClient();
    try {
      const response = await client.listModels();
      logger.info('Listed available models', { count: response.models.length });

      console.log(chalk.yellow('\nAvailable Ollama models:\n'));
      for (const model of response.models) {
        const size = (model.size / 1024 / 1024 / 1024).toFixed(2);
        console.log(chalk.cyan(`  ${model.name}`));
        console.log(chalk.gray(`    Size: ${size} GB`));
        console.log(chalk.gray(`    Modified: ${model.modified_at}`));
        console.log();
      }
    } catch (error) {
      logger.error('Failed to list models', error);
      console.error(chalk.red(formatErrorForDisplay(error)));
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Check Ollama server health')
  .action(async () => {
    const client = new OllamaClient();
    try {
      const isHealthy = await client.healthCheck();

      if (isHealthy) {
        logger.info('Ollama server health check passed');
        console.log(chalk.green('✓ Ollama server is running'));
        const response = await client.listModels();
        console.log(chalk.gray(`  ${response.models.length} models available`));
      } else {
        const error = new NetworkError('Ollama server is not accessible');
        logger.error('Ollama server health check failed', error);
        console.log(chalk.red('✗ Ollama server is not accessible'));
        process.exit(1);
      }
    } catch (error) {
      logger.error('Failed to check Ollama server health', error);
      console.error(chalk.red(formatErrorForDisplay(error)));
      process.exit(1);
    }
  });

program.parse();
