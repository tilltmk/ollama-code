import { z } from 'zod';
import type { Tool, ToolDefinition, ToolCall } from '../types/index.js';

export class ToolManager {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a new tool
   */
  registerTool(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
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
   * Convert Zod schema to JSON Schema format for Ollama
   */
  private zodToJsonSchema(schema: z.ZodType<any>): any {
    // This is a simplified conversion
    // For production, consider using a library like zod-to-json-schema

    if (schema instanceof z.ZodObject) {
      const shape = (schema as any).shape;
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodType<any>);
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    if (schema instanceof z.ZodString) {
      return {
        type: 'string',
        description: (schema as any)._def?.description,
      };
    }

    if (schema instanceof z.ZodNumber) {
      return {
        type: 'number',
        description: (schema as any)._def?.description,
      };
    }

    if (schema instanceof z.ZodBoolean) {
      return {
        type: 'boolean',
        description: (schema as any)._def?.description,
      };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToJsonSchema((schema as any)._def?.type),
        description: (schema as any)._def?.description,
      };
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema((schema as any)._def?.innerType);
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: (schema as any)._def?.values,
        description: (schema as any)._def?.description,
      };
    }

    // Fallback
    return { type: 'string' };
  }

  /**
   * Convert tool definitions to Ollama-compatible format
   */
  getToolsForOllama(): Tool[] {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.zodToJsonSchema(tool.schema),
      },
    }));
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolCall: ToolCall): Promise<any> {
    const tool = this.tools.get(toolCall.function.name);
    if (!tool) {
      throw new Error(`Tool not found: ${toolCall.function.name}`);
    }

    // Parse and validate arguments
    let args: any;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch (error) {
      throw new Error(`Invalid tool arguments JSON: ${error}`);
    }

    // Validate with Zod schema
    const validatedArgs = tool.schema.parse(args);

    // Execute the tool
    return await tool.executor(validatedArgs);
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeTools(toolCalls: ToolCall[]): Promise<Array<{ id: string; result: any; error?: string }>> {
    return Promise.all(
      toolCalls.map(async (call) => {
        try {
          const result = await this.executeTool(call);
          return { id: call.id, result };
        } catch (error) {
          return {
            id: call.id,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );
  }
}
