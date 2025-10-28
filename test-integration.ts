#!/usr/bin/env tsx

/**
 * Integration Test für Ollama Code
 * Testet Tool-Calling-Funktionalität mit echten Modellen
 */

import { Agent } from './src/llm/agent.js';
import { ModelManager } from './src/llm/model-manager.js';
import { ToolManager } from './src/tools/tool-manager.js';
import { ConfigManager } from './src/config/index.js';
import { allTools } from './src/tools/index.js';
import chalk from 'chalk';

async function testToolCalling() {
  console.log(chalk.bold.cyan('\n=== Ollama Code Integration Test ===\n'));

  // Setup
  const configManager = new ConfigManager();
  await configManager.load();

  const toolManager = new ToolManager();
  toolManager.registerTools(allTools);

  const modelManager = new ModelManager(configManager.get());
  await modelManager.initialize();

  const agent = new Agent(
    configManager.get(),
    toolManager,
    modelManager
  );

  // System Prompt
  agent.setSystemPrompt(`You are a helpful coding assistant. Use the available tools to help users.
When asked to work with files, use the appropriate file tools.
Be concise and direct.`);

  console.log(chalk.yellow('✓ System initialized'));
  console.log(chalk.gray(`  Tools loaded: ${toolManager.getAllTools().length}`));
  console.log(chalk.gray(`  Models available: ${modelManager.getAvailableModels().length}`));

  const selectedModel = modelManager.selectModelForTask('code');
  console.log(chalk.gray(`  Selected model: ${selectedModel}\n`));

  // Test 1: File Writing
  console.log(chalk.bold.blue('Test 1: File Writing'));
  console.log(chalk.gray('Task: Write a simple test file\n'));

  try {
    const response1 = await agent.run(
      'Create a file called test-output.txt with the content "Hello from Ollama Code! This is a test."',
      { verbose: true, model: selectedModel }
    );
    console.log(chalk.green('✓ Response:'), response1.substring(0, 200));
  } catch (error) {
    console.error(chalk.red('✗ Test 1 failed:'), error);
  }

  // Test 2: File Reading
  console.log(chalk.bold.blue('\nTest 2: File Reading'));
  console.log(chalk.gray('Task: Read the file we just created\n'));

  try {
    const response2 = await agent.run(
      'Read the test-output.txt file and tell me what it contains',
      { verbose: true, model: selectedModel }
    );
    console.log(chalk.green('✓ Response:'), response2.substring(0, 200));
  } catch (error) {
    console.error(chalk.red('✗ Test 2 failed:'), error);
  }

  // Test 3: Glob Search
  console.log(chalk.bold.blue('\nTest 3: File Search'));
  console.log(chalk.gray('Task: Find all TypeScript files in src/\n'));

  try {
    const response3 = await agent.run(
      'Find all .ts files in the src directory using glob pattern',
      { verbose: true, model: selectedModel }
    );
    console.log(chalk.green('✓ Response:'), response3.substring(0, 300));
  } catch (error) {
    console.error(chalk.red('✗ Test 3 failed:'), error);
  }

  // Test 4: Code Search with Grep
  console.log(chalk.bold.blue('\nTest 4: Code Search'));
  console.log(chalk.gray('Task: Search for "OllamaClient" in src/\n'));

  try {
    const response4 = await agent.run(
      'Search for the word "OllamaClient" in all TypeScript files',
      { verbose: true, model: selectedModel }
    );
    console.log(chalk.green('✓ Response:'), response4.substring(0, 300));
  } catch (error) {
    console.error(chalk.red('✗ Test 4 failed:'), error);
  }

  // Test 5: Bash Command
  console.log(chalk.bold.blue('\nTest 5: Bash Execution'));
  console.log(chalk.gray('Task: Execute a simple bash command\n'));

  try {
    const response5 = await agent.run(
      'Use bash to show me the current directory and list the main files',
      { verbose: true, model: selectedModel }
    );
    console.log(chalk.green('✓ Response:'), response5.substring(0, 300));
  } catch (error) {
    console.error(chalk.red('✗ Test 5 failed:'), error);
  }

  console.log(chalk.bold.green('\n✓ All tests completed!\n'));
}

// Run tests
testToolCalling().catch(error => {
  console.error(chalk.red('Test suite failed:'), error);
  process.exit(1);
});
