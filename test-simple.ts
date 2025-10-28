#!/usr/bin/env npx tsx

/**
 * Simple Test - Tool-System direkt testen
 */

import { ToolManager } from './src/tools/tool-manager.js';
import { allTools } from './src/tools/index.js';
import { promises as fs } from 'fs';
import chalk from 'chalk';

async function testTools() {
  console.log(chalk.bold.cyan('\n=== Direct Tool Test ===\n'));

  const toolManager = new ToolManager();
  toolManager.registerTools(allTools);

  console.log(chalk.yellow('✓ Tools registered:'), toolManager.getAllTools().length);

  // Test 1: Write File Tool
  console.log(chalk.bold.blue('\nTest 1: Write File'));
  const writeTool = toolManager.getTool('write_file');
  if (writeTool) {
    try {
      const result = await writeTool.executor({
        file_path: '/home/core/dev/bricked-code/ollama-code/test-direct.txt',
        content: 'Hello from direct tool test!\nThis proves the tools work correctly.'
      });
      console.log(chalk.green('✓ Result:'), result);
    } catch (error) {
      console.error(chalk.red('✗ Failed:'), error);
    }
  }

  // Test 2: Read File Tool
  console.log(chalk.bold.blue('\nTest 2: Read File'));
  const readTool = toolManager.getTool('read_file');
  if (readTool) {
    try {
      const result = await readTool.executor({
        file_path: '/home/core/dev/bricked-code/ollama-code/test-direct.txt'
      });
      console.log(chalk.green('✓ Content read:'));
      console.log(result);
    } catch (error) {
      console.error(chalk.red('✗ Failed:'), error);
    }
  }

  // Test 3: Glob Tool
  console.log(chalk.bold.blue('\nTest 3: Glob Search'));
  const globTool = toolManager.getTool('glob');
  if (globTool) {
    try {
      const result = await globTool.executor({
        pattern: '*.ts',
        path: '/home/core/dev/bricked-code/ollama-code/src/cli'
      });
      console.log(chalk.green('✓ Files found:'));
      console.log(result);
    } catch (error) {
      console.error(chalk.red('✗ Failed:'), error);
    }
  }

  // Test 4: Grep Tool
  console.log(chalk.bold.blue('\nTest 4: Grep Search'));
  const grepTool = toolManager.getTool('grep');
  if (grepTool) {
    try {
      const result = await grepTool.executor({
        pattern: 'OllamaClient',
        path: '/home/core/dev/bricked-code/ollama-code/src',
        glob: '*.ts',
        output_mode: 'files_with_matches'
      });
      console.log(chalk.green('✓ Matches:'));
      console.log(result);
    } catch (error) {
      console.error(chalk.red('✗ Failed:'), error);
    }
  }

  // Test 5: Bash Tool
  console.log(chalk.bold.blue('\nTest 5: Bash Command'));
  const bashTool = toolManager.getTool('bash');
  if (bashTool) {
    try {
      const result = await bashTool.executor({
        command: 'echo "Test successful!" && whoami && pwd'
      });
      console.log(chalk.green('✓ Output:'));
      console.log(result);
    } catch (error) {
      console.error(chalk.red('✗ Failed:'), error);
    }
  }

  // Test 6: Check Ollama JSON Schema Format
  console.log(chalk.bold.blue('\nTest 6: Tool Schema for Ollama'));
  const schemas = toolManager.getToolsForOllama();
  console.log(chalk.green('✓ Tool schemas generated:'), schemas.length);
  console.log(chalk.gray('\nSample schema (write_file):'));
  console.log(JSON.stringify(schemas.find(s => s.function.name === 'write_file'), null, 2));

  console.log(chalk.bold.green('\n✓ All direct tool tests passed!\n'));

  // Cleanup
  try {
    await fs.unlink('/home/core/dev/bricked-code/ollama-code/test-direct.txt');
    console.log(chalk.gray('Cleanup: test file removed'));
  } catch {}
}

testTools().catch(console.error);
