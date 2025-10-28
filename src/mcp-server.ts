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

    // Convert tools to MCP format
    const mcpTools: Tool[] = tools.map((tool) => {
      // Convert Zod schema to JSON Schema
      const jsonSchema = toolManager.getToolsForOllama()
        .find(t => t.function.name === tool.name)?.function.parameters;

      return {
        name: tool.name,
        description: tool.description,
        inputSchema: jsonSchema || { type: 'object', properties: {} },
      };
    });

    return { tools: mcpTools };
  });

  // Handle tool execution request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Create a ToolCall object for execution
      const toolCall = {
        id: `call_${Date.now()}`,
        type: 'function' as const,
        function: {
          name,
          arguments: JSON.stringify(args || {}),
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
            text: `Error executing tool ${name}: ${errorMessage}`,
          },
        ],
        isError: true,
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
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
