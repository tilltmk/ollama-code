#!/usr/bin/env node

/**
 * MCP Server for Ollama Code
 * Exposes Ollama-powered tools to Claude Code via Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { ConfigManager } from './config/index.js';
import { ToolManager } from './tools/tool-manager.js';
import { ModelManager } from './llm/model-manager.js';
import { allTools } from './tools/index.js';

/**
 * Create and start the MCP server
 */
async function main() {
  // Initialize managers
  const configManager = new ConfigManager();
  await configManager.load();
  const config = configManager.get();

  const toolManager = new ToolManager();
  const modelManager = new ModelManager(config);
  await modelManager.initialize();

  // Register all tools
  toolManager.registerTools(allTools);

  // Create MCP server
  const server = new Server(
    {
      name: 'ollama-code',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = toolManager.getAllTools();

    // Convert tools to MCP format using cached schemas
    const ollamaTools = toolManager.getToolsForOllama();
    const mcpTools: Tool[] = tools.map((tool) => {
      // Get the pre-computed schema from cache
      const jsonSchema = ollamaTools
        .find(t => t.function.name === tool.name)?.function.parameters;

      return {
        name: tool.name,
        description: tool.description,
        inputSchema: jsonSchema || { type: 'object', properties: {} },
      };
    });

    return { tools: mcpTools };
  });

  // Handle tool execution request with improved error handling
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Check if tool exists
      const tool = toolManager.getTool(name);
      if (!tool) {
        const availableTools = toolManager.getAllTools().map(t => t.name).join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Tool not found: ${name}. Available tools: ${availableTools}`,
            },
          ],
        };
      }

      // Validate arguments against schema
      const validation = tool.schema.safeParse(args || {});
      if (!validation.success) {
        const errorDetails = validation.error.errors
          .map((e: any) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');

        return {
          content: [
            {
              type: 'text',
              text: `Invalid arguments for ${name}: ${errorDetails}`,
            },
          ],
        };
      }

      // Create a ToolCall object for execution
      const toolCall = {
        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function' as const,
        function: {
          name,
          arguments: JSON.stringify(validation.data),
        },
      };

      // Execute the tool
      const result = await toolManager.executeTool(toolCall);

      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text',
            text: `Tool execution failed: ${errorMessage}`,
          },
        ],
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is used for MCP communication)
  console.error('Ollama Code MCP Server started');
  console.error(`Available tools: ${toolManager.getAllTools().length}`);
  console.error(`Ollama URL: ${config.ollamaUrl}`);

  // Handle graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.error(`\n${signal} received, shutting down gracefully...`);
      try {
        await server.close();
        console.error('Server closed successfully');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
