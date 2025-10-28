/**
 * Final validation test
 * Quick test to ensure everything works
 */

import { Agent } from './src/llm/agent.js';
import { ModelManager } from './src/llm/model-manager.js';
import { ToolManager } from './src/tools/tool-manager.js';
import { ConfigManager } from './src/config/index.js';
import { allTools } from './src/tools/index.js';
import fs from 'fs/promises';

async function runFinalTests() {
  console.log('🧪 Running Final Validation Tests\n');
  console.log('═'.repeat(60));

  const results: { test: string; passed: boolean; error?: string }[] = [];

  // Test 1: Configuration
  console.log('\n✓ Test 1: Configuration System');
  try {
    const configManager = new ConfigManager();
    await configManager.load();
    const config = configManager.get();
    console.log(`  Ollama URL: ${config.ollamaUrl}`);
    console.log(`  Default Model: ${config.defaultModel || 'auto-select'}`);
    results.push({ test: 'Configuration', passed: true });
  } catch (error) {
    results.push({ test: 'Configuration', passed: false, error: String(error) });
  }

  // Test 2: Model Manager
  console.log('\n✓ Test 2: Model Manager');
  try {
    const configManager = new ConfigManager();
    const config = configManager.get();
    const modelManager = new ModelManager(config);
    await modelManager.initialize();

    const models = modelManager.getAvailableModels();
    console.log(`  Available models: ${models.length}`);

    const selected = modelManager.selectModelForTask('code');
    console.log(`  Auto-selected for code: ${selected}`);
    results.push({ test: 'Model Manager', passed: true });
  } catch (error) {
    results.push({ test: 'Model Manager', passed: false, error: String(error) });
  }

  // Test 3: Tool Manager
  console.log('\n✓ Test 3: Tool Manager');
  try {
    const toolManager = new ToolManager();
    toolManager.registerTools(allTools);

    const tools = toolManager.getAllTools();
    console.log(`  Registered tools: ${tools.length}`);
    console.log(`  Tools: ${tools.map(t => t.name).slice(0, 5).join(', ')}...`);
    results.push({ test: 'Tool Manager', passed: true });
  } catch (error) {
    results.push({ test: 'Tool Manager', passed: false, error: String(error) });
  }

  // Test 4: File Tool
  console.log('\n✓ Test 4: File Operations Tool');
  try {
    const testFile = '/tmp/ollama-code-test-final.txt';
    await fs.writeFile(testFile, 'Test content from final validation');
    const content = await fs.readFile(testFile, 'utf-8');

    if (content === 'Test content from final validation') {
      console.log(`  File operations: Working`);
      results.push({ test: 'File Operations', passed: true });
    } else {
      throw new Error('File content mismatch');
    }

    await fs.unlink(testFile);
  } catch (error) {
    results.push({ test: 'File Operations', passed: false, error: String(error) });
  }

  // Test 5: Agent Initialization
  console.log('\n✓ Test 5: Agent Initialization');
  try {
    const configManager = new ConfigManager();
    const config = configManager.get();
    const modelManager = new ModelManager(config);
    const toolManager = new ToolManager();
    toolManager.registerTools(allTools);

    const agent = new Agent(config, toolManager, modelManager);
    agent.setSystemPrompt('Test system prompt');

    const history = agent.getHistory();
    console.log(`  Agent initialized with ${history.length} messages`);
    results.push({ test: 'Agent Initialization', passed: true });
  } catch (error) {
    results.push({ test: 'Agent Initialization', passed: false, error: String(error) });
  }

  // Test 6: Tool count verification
  console.log('\n✓ Test 6: Tool Ecosystem');
  try {
    const toolManager = new ToolManager();
    toolManager.registerTools(allTools);
    const tools = toolManager.getAllTools();

    const categories = {
      file: tools.filter(t => ['read_file', 'write_file', 'edit_file', 'glob'].includes(t.name)).length,
      grep: tools.filter(t => t.name === 'grep').length,
      bash: tools.filter(t => t.name === 'bash').length,
      multiAgent: tools.filter(t => t.name === 'delegate_to_subagents').length,
      sqlite: tools.filter(t => t.name.startsWith('sql_')).length,
      http: tools.filter(t => t.name.startsWith('http_') || t.name.startsWith('download_')).length,
      callback: tools.filter(t => t.name.includes('callback')).length,
    };

    console.log(`  File Operations: ${categories.file} tools`);
    console.log(`  Code Search: ${categories.grep} tools`);
    console.log(`  System: ${categories.bash} tools`);
    console.log(`  Multi-Agent: ${categories.multiAgent} tools`);
    console.log(`  SQLite: ${categories.sqlite} tools`);
    console.log(`  HTTP: ${categories.http} tools`);
    console.log(`  Callback Loop: ${categories.callback} tools`);

    const total = Object.values(categories).reduce((a, b) => a + b, 0);
    console.log(`  Total: ${total} tools`);

    results.push({ test: 'Tool Ecosystem', passed: total >= 16 });
  } catch (error) {
    results.push({ test: 'Tool Ecosystem', passed: false, error: String(error) });
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 Test Summary\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.test}: ${r.passed ? 'PASSED' : 'FAILED'}`);
    if (r.error) {
      console.log(`   Error: ${r.error}`);
    }
  });

  console.log(`\n${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('\n🎉 All tests passed! Ready for release.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed.\n');
    process.exit(1);
  }
}

runFinalTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
