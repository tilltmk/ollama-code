import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool, ToolDefinition, ToolCall } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { ValidationError, ToolExecutionError } from '../utils/errors.js';

export class ToolManager {
  private tools: Map<string, ToolDefinition> = new Map();
  // PERFORMANCE: Cache for Zod schema conversions to avoid repeated processing
  private schemaCache: Map<string, any> = new Map();

  /**
   * Register a new tool
   */
  registerTool(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
    // Clear cache entry when tool is re-registered
    this.schemaCache.delete(definition.name);
  }

  /**
   * Register multiple tools
   */
  registerTools(definitions: ToolDefinition[]): void {
    for (const def of definitions) {
      this.registerTool(def);
    }
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Convert Zod schema to JSON Schema format using zod-to-json-schema library
   */
  private convertZodToJsonSchema(schema: z.ZodType<any>): any {
    return zodToJsonSchema(schema, {
      target: 'openApi3',
      $refStrategy: 'none'
    });
  }

  /**
   * Convert tool definitions to Ollama-compatible format
   *
   * PERFORMANCE: Cache schema conversions to avoid repeated Zod processing
   */
  getToolsForOllama(): Tool[] {
    return Array.from(this.tools.values()).map(tool => {
      // Check cache first
      let jsonSchema = this.schemaCache.get(tool.name);

      if (!jsonSchema) {
        // Convert and cache
        jsonSchema = this.convertZodToJsonSchema(tool.schema);
        this.schemaCache.set(tool.name, jsonSchema);
      }

      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: jsonSchema,
        },
      };
    });
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolCall: ToolCall): Promise<any> {
    const toolName = toolCall.function.name;
    const tool = this.tools.get(toolName);

    if (!tool) {
      const error = new ToolExecutionError(`Tool not found: ${toolName}`, toolName);
      logger.error('Tool not found', error, { toolName, availableTools: Array.from(this.tools.keys()) });
      throw error;
    }

    logger.tool(toolName, 'start', { callId: toolCall.id });

    // Parse and validate arguments
    let args: any;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch (error) {
      const parseError = new ValidationError(
        `Invalid tool arguments JSON for ${toolName}`,
        'arguments',
        toolCall.function.arguments
      );
      logger.error('Failed to parse tool arguments', error, { toolName, arguments: toolCall.function.arguments });
      throw parseError;
    }

    // Validate with Zod schema
    try {
      const validatedArgs = tool.schema.parse(args);

      // Execute the tool
      const result = await tool.executor(validatedArgs);
      logger.tool(toolName, 'success', { callId: toolCall.id });
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError(
          `Validation failed for tool ${toolName}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          error.errors[0]?.path.join('.'),
          args
        );
        logger.error('Tool validation failed', validationError, {
          toolName,
          zodErrors: error.errors,
          arguments: args
        });
        throw validationError;
      }

      // Tool execution error
      const executionError = new ToolExecutionError(
        `Failed to execute tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
        toolName,
        error instanceof Error ? error : undefined
      );
      logger.tool(toolName, 'error', {
        callId: toolCall.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw executionError;
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeTools(toolCalls: ToolCall[]): Promise<Array<{ id: string; result: any; error?: string }>> {
    logger.info(`Executing ${toolCalls.length} tool call(s) in parallel`, {
      tools: toolCalls.map(tc => tc.function.name)
    });

    return Promise.all(
      toolCalls.map(async (call) => {
        try {
          const result = await this.executeTool(call);
          return { id: call.id, result };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Tool call failed: ${call.function.name}`, error, {
            callId: call.id,
            toolName: call.function.name
          });

          return {
            id: call.id,
            result: null,
            error: errorMessage,
          };
        }
      })
    );
  }
}
