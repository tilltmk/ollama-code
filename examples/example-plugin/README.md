# Example Plugin

This is an example plugin for ollama-code that demonstrates how to create and register custom tools.

## Structure

```
example-plugin/
├── .claude-plugin/
│   └── plugin.json      # Plugin manifest
├── index.js            # Plugin entry point
└── README.md          # This file
```

## Plugin Manifest (plugin.json)

The manifest defines the plugin's metadata:

```json
{
  "name": "example-tool-plugin",
  "version": "1.0.0",
  "description": "Example plugin that registers a custom tool",
  "main": "index.js",
  "type": "tool",
  "permissions": []
}
```

- `name`: Unique plugin identifier
- `version`: Semver version
- `description`: Human-readable description
- `main`: Entry point file (relative to plugin directory)
- `type`: Plugin type (`tool`, `command`, `hook`, or `mixed`)
- `permissions`: Required permissions (e.g., `["fs", "network", "exec"]`)

## Plugin Implementation

The plugin exports an `initialize` function that receives a Plugin API:

```javascript
export async function initialize(api) {
  // Register tools
  api.registerTool({
    name: 'tool_name',
    description: 'Tool description',
    schema: zodSchema,
    executor: async (args) => {
      // Tool implementation
      return result;
    }
  });
  
  // Use logger
  api.logger.info('Plugin initialized');
}
```

## Plugin API

The Plugin API provides:

### `api.registerTool(tool)`
Register a new tool that the AI can use.

### `api.registerCommand(command)`
Register a custom command.

### `api.registerHook(hook)`
Register a hook to intercept and modify behavior.

### `api.logger`
Logging utilities:
- `api.logger.info(msg)`
- `api.logger.warn(msg)`
- `api.logger.error(msg)`
- `api.logger.debug(msg)` (only if DEBUG=1)

## Using This Plugin

1. Copy the plugin directory to your plugins folder
2. Configure ollama-code to load plugins from that directory
3. The plugin will be automatically loaded and tools registered

## Example Tools

This plugin registers two example tools:

### get_weather
Get weather information for a city.

```javascript
{
  city: "Berlin",
  units: "celsius" // optional
}
```

### calculate
Perform basic math operations.

```javascript
{
  operation: "add", // add, subtract, multiply, divide
  a: 10,
  b: 5
}
```
