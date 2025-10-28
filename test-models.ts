#!/usr/bin/env npx tsx

/**
 * Test verschiedene Modelle für Tool Calling Support
 */

import { Agent } from './src/llm/agent.js';
import { ModelManager } from './src/llm/model-manager.js';
import { ToolManager } from './src/tools/tool-manager.js';
import { ConfigManager } from './src/config/index.js';
import { allTools } from './src/tools/index.js';
import chalk from 'chalk';

const MODELS_TO_TEST = [
  'llama3.1:8b',
  'qwen3-coder:30b',
  'gpt-oss:20b',
  'gemma3:12b',
  'granite3.3:8b',
  'granite4:micro',
];

async function testModel(modelName: string) {
  console.log(chalk.bold.cyan(`\n=== Testing: ${modelName} ===`));

  const configManager = new ConfigManager();
  await configManager.load();
  configManager.update({ defaultModel: modelName });

  const toolManager = new ToolManager();
  toolManager.registerTools(allTools);

  const modelManager = new ModelManager(configManager.get());
  try {
    await modelManager.initialize();
  } catch (error) {
    console.log(chalk.red('✗ Failed to initialize model manager'));
    return { model: modelName, status: 'error', error: String(error) };
  }

  // Check if model is available
  if (!modelManager.isModelAvailable(modelName)) {
    console.log(chalk.yellow('⚠ Model not available, skipping'));
    return { model: modelName, status: 'not_available' };
  }

  const agent = new Agent(configManager.get(), toolManager, modelManager);
  agent.setSystemPrompt('You are a helpful assistant. Use tools when appropriate.');

  // Simple test: Ask to create a file
  const testPrompt = 'Create a test file called test-model.txt with the text "Test from ' + modelName + '"';

  try {
    console.log(chalk.gray('Prompt:'), testPrompt);
    const startTime = Date.now();

    const response = await agent.run(testPrompt, {
      verbose: false,
      model: modelName
    });

    const duration = Date.now() - startTime;

    console.log(chalk.green('✓ Response received'));
    console.log(chalk.gray('Duration:'), `${duration}ms`);
    console.log(chalk.gray('Response preview:'), response.substring(0, 150) + '...');

    // Check if file was created (tool was actually used)
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile('test-model.txt', 'utf-8');
      console.log(chalk.green('✓ Tool calling works! File was created.'));
      await fs.unlink('test-model.txt'); // cleanup
      return { model: modelName, status: 'success', duration, toolCalling: true };
    } catch {
      console.log(chalk.yellow('⚠ Response received but tool not executed correctly'));
      return { model: modelName, status: 'partial', duration, toolCalling: false };
    }
  } catch (error) {
    console.log(chalk.red('✗ Test failed'));
    console.error(chalk.red(String(error).substring(0, 200)));
    return { model: modelName, status: 'failed', error: String(error).substring(0, 100) };
  }
}

async function runTests() {
  console.log(chalk.bold.yellow('\n=== Model Tool Calling Test Suite ===\n'));

  const results = [];

  for (const model of MODELS_TO_TEST) {
    const result = await testModel(model);
    results.push(result);

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log(chalk.bold.cyan('\n\n=== Test Summary ===\n'));
  console.log(chalk.bold('Model | Status | Tool Calling | Duration'));
  console.log('─'.repeat(60));

  for (const result of results) {
    const status = result.status === 'success' ? chalk.green('✓ Success') :
                   result.status === 'partial' ? chalk.yellow('⚠ Partial') :
                   result.status === 'not_available' ? chalk.gray('N/A') :
                   chalk.red('✗ Failed');

    const toolCalling = result.toolCalling === true ? chalk.green('Yes') :
                        result.toolCalling === false ? chalk.red('No') :
                        chalk.gray('-');

    const duration = result.duration ? `${result.duration}ms` : '-';

    console.log(`${result.model.padEnd(20)} | ${status.padEnd(12)} | ${toolCalling.padEnd(5)} | ${duration}`);
  }

  console.log('\n');

  // Recommendations
  console.log(chalk.bold.yellow('Recommendations:'));
  const working = results.filter(r => r.status === 'success');
  if (working.length > 0) {
    console.log(chalk.green('\nBest models for tool calling:'));
    for (const r of working) {
      console.log(chalk.green(`  ✓ ${r.model}`));
    }
  }

  const partial = results.filter(r => r.status === 'partial');
  if (partial.length > 0) {
    console.log(chalk.yellow('\nModels that respond but don\'t use tools correctly:'));
    for (const r of partial) {
      console.log(chalk.yellow(`  ⚠ ${r.model}`));
    }
  }
}

runTests().catch(console.error);
