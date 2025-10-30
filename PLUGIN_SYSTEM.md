# Plugin System Documentation

## Overview

The ollama-code plugin system allows you to extend the functionality by loading external JavaScript/TypeScript modules that can register custom tools, commands, and hooks.

## Key Features

- **Dynamic Code Execution**: Plugins can execute real JavaScript code, not just load metadata
- **Tool Registration**: Plugins can register custom tools that the AI agent can use
- **Command Registration**: Add custom CLI commands
- **Hook System**: Intercept and modify behavior at runtime
- **Plugin API**: Clean API for plugins to interact with the system
- **Logging**: Built-in logging system for plugin debugging

## Plugin Structure

A plugin is a directory containing:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json      # Required: Plugin manifest
├── index.js            # Entry point (specified in manifest)
└── package.json        # Optional: Dependencies
```

## Plugin Manifest

The `.claude-plugin/plugin.json` file defines the plugin:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My custom plugin",
  "main": "index.js",
  "type": "tool",
  "permissions": ["fs", "network"]
}
```

### Manifest Fields

- **name** (required): Unique plugin identifier
- **version** (required): Semver version string
- **description** (required): Human-readable description
- **main** (optional): Entry point file path relative to plugin directory
- **type** (optional): Plugin type - `tool`, `command`, `hook`, or `mixed`
- **permissions** (optional): Array of required permissions
- **commands** (optional): List of command names this plugin provides
- **agents** (optional): List of agent names this plugin provides
- **hooks** (optional): List of hook names this plugin provides

## Plugin Implementation

### Basic Structure

```javascript
// index.js
export async function initialize(api) {
  // Plugin initialization code
  api.logger.info('Plugin loaded!');
  
  // Register tools, commands, hooks, etc.
}
```

Or using default export:

```javascript
export default async function(api) {
  // Plugin initialization code
}
```

### Plugin API

The `api` parameter provides the following:

#### `api.registerTool(tool)`

Register a new tool for the AI agent:

```javascript
import { z } from 'zod';

api.registerTool({
  name: 'my_tool',
  description: 'Description of what the tool does',
  schema: z.object({
    param1: z.string().describe('First parameter'),
    param2: z.number().optional().describe('Second parameter'),
  }),
  executor: async (args) => {
    // Tool implementation
    return { result: 'success' };
  }
});
```

#### `api.registerCommand(command)`

Register a custom CLI command:

```javascript
api.registerCommand({
  name: 'my-command',
  description: 'My custom command',
  execute: async (args) => {
    // Command implementation
  }
});
```

#### `api.registerHook(hook)`

Register a hook to intercept behavior:

```javascript
api.registerHook({
  name: 'before-tool-call',
  handler: async (context) => {
    // Hook implementation
    return context; // Modified or original
  }
});
```

#### `api.logger`

Logging utilities:

```javascript
api.logger.info('Info message');
api.logger.warn('Warning message');
api.logger.error('Error message');
api.logger.debug('Debug message'); // Only if DEBUG env var is set
```

## Loading Plugins

Plugins are loaded from configured directories:

```javascript
import { PluginLoader } from './plugins/plugin-loader.js';
import { ToolManager } from './tools/tool-manager.js';

const pluginLoader = new PluginLoader();
const toolManager = new ToolManager();

// Set the tool manager for plugin tool registration
pluginLoader.setToolManager(toolManager);

// Add plugin directories
pluginLoader.addPluginDirectory('./plugins');
pluginLoader.addPluginDirectory('~/.ollama-code/plugins');

// Load all plugins
await pluginLoader.loadPlugins();

// Get loaded plugins
const plugins = pluginLoader.getLoadedPlugins();
console.log(`Loaded ${plugins.length} plugins`);
```

## Security Considerations

### Current Implementation

The current plugin system uses **direct code execution** without sandboxing:
- Plugins have full access to Node.js APIs
- Plugins run in the same process as the main application
- No permission enforcement beyond checking the manifest

### Future Enhancements

For production use, consider implementing:

1. **Sandboxing**: Use `vm2` or `worker_threads` to isolate plugin code
2. **Permission System**: Enforce permissions declared in manifest
3. **Resource Limits**: CPU, memory, and I/O limits for plugins
4. **Code Signing**: Verify plugin authenticity
5. **Plugin Registry**: Centralized, trusted plugin repository

## Example Plugin Types

### Tool Plugin

```javascript
export async function initialize(api) {
  api.registerTool({
    name: 'get_data',
    description: 'Fetch data from API',
    schema: z.object({
      endpoint: z.string(),
    }),
    executor: async (args) => {
      const response = await fetch(args.endpoint);
      return await response.json();
    }
  });
}
```

### Command Plugin

```javascript
export async function initialize(api) {
  api.registerCommand({
    name: 'analyze',
    description: 'Analyze codebase',
    execute: async (args) => {
      api.logger.info('Running analysis...');
      // Implementation
    }
  });
}
```

### Hook Plugin

```javascript
export async function initialize(api) {
  api.registerHook({
    name: 'before-tool-call',
    handler: async (context) => {
      api.logger.info(`Tool called: ${context.toolName}`);
      // Modify or log
      return context;
    }
  });
}
```

## Plugin Development Best Practices

1. **Error Handling**: Always wrap plugin code in try-catch
2. **Logging**: Use `api.logger` instead of `console.log`
3. **Dependencies**: Document any npm dependencies in README
4. **Type Safety**: Use TypeScript or JSDoc for type checking
5. **Testing**: Include tests for your plugin
6. **Documentation**: Provide clear README with examples

## Troubleshooting

### Plugin Not Loading

Check:
1. Manifest file exists at `.claude-plugin/plugin.json`
2. Manifest is valid JSON
3. `main` field points to existing file
4. Entry point exports `initialize` function

### Tool Not Working

Check:
1. ToolManager is set before loading plugins
2. Tool schema is valid Zod schema
3. Executor function returns a value
4. No errors in console logs

### Enable Debug Logging

```bash
DEBUG=1 ollama-code
```

This will show debug messages from plugins.

## Migration from Metadata-Only System

The old system only loaded JSON metadata. The new system executes plugin code.

**Before:**
```json
{
  "name": "my-plugin",
  "commands": ["cmd1", "cmd2"]
}
```

**After:**
```javascript
// plugin.json
{
  "name": "my-plugin",
  "main": "index.js"
}

// index.js
export async function initialize(api) {
  api.registerCommand({ name: 'cmd1', ... });
  api.registerCommand({ name: 'cmd2', ... });
}
```

## API Reference

### PluginLoader Class

```typescript
class PluginLoader {
  setToolManager(toolManager: ToolManager): void;
  setCommandRegistry(registry: Map<string, any>): void;
  setHookRegistry(registry: Map<string, any[]>): void;
  addPluginDirectory(dir: string): void;
  loadPlugins(): Promise<void>;
  getLoadedPlugins(): LoadedPlugin[];
  getPlugin(name: string): LoadedPlugin | undefined;
  getPluginManifests(): PluginManifest[];
}
```

### Types

```typescript
type PluginType = 'tool' | 'command' | 'hook' | 'mixed';

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  main?: string;
  type?: PluginType;
  permissions?: string[];
  commands?: string[];
  agents?: string[];
  hooks?: string[];
}

interface PluginAPI {
  registerTool: (tool: ToolDefinition) => void;
  registerCommand: (command: any) => void;
  registerHook: (hook: any) => void;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
}

interface LoadedPlugin {
  manifest: PluginManifest;
  path: string;
  instance?: any;
  initialized: boolean;
}
```

## Next Steps

1. Review the example plugin in `examples/example-plugin/`
2. Create your own plugin
3. Test it with ollama-code
4. Share it with the community!

## Contributing

When contributing plugins or plugin system improvements:

1. Follow existing code style
2. Add tests for new features
3. Update documentation
4. Create example plugins demonstrating new features
