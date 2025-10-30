import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolManager } from './tool-manager.js';
import { z } from 'zod';
import type { ToolDefinition, ToolCall } from '../types/index.js';

describe('ToolManager', () => {
  let toolManager: ToolManager;

  beforeEach(() => {
    toolManager = new ToolManager();
  });

  describe('tool registration', () => {
    it('should register a single tool', () => {
      const toolDef: ToolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        schema: z.object({
          param: z.string(),
        }),
        executor: vi.fn(),
      };

      toolManager.registerTool(toolDef);

      expect(toolManager.getTool('test_tool')).toBeDefined();
      expect(toolManager.getTool('test_tool')).toEqual(toolDef);
    });

    it('should register multiple tools', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'tool1',
          description: 'First tool',
          schema: z.object({ a: z.string() }),
          executor: vi.fn(),
        },
        {
          name: 'tool2',
          description: 'Second tool',
          schema: z.object({ b: z.number() }),
          executor: vi.fn(),
        },
      ];

      toolManager.registerTools(tools);

      expect(toolManager.getTool('tool1')).toBeDefined();
      expect(toolManager.getTool('tool2')).toBeDefined();
      expect(toolManager.getAllTools()).toHaveLength(2);
    });

    it('should override existing tool on re-registration', () => {
      const tool1: ToolDefinition = {
        name: 'tool',
        description: 'First version',
        schema: z.object({ a: z.string() }),
        executor: vi.fn(),
      };

      const tool2: ToolDefinition = {
        name: 'tool',
        description: 'Second version',
        schema: z.object({ b: z.string() }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool1);
      toolManager.registerTool(tool2);

      const registered = toolManager.getTool('tool');
      expect(registered?.description).toBe('Second version');
    });

    it('should return undefined for non-existent tool', () => {
      expect(toolManager.getTool('non_existent')).toBeUndefined();
    });

    it('should return all registered tools', () => {
      toolManager.registerTool({
        name: 'tool1',
        description: 'Tool 1',
        schema: z.object({}),
        executor: vi.fn(),
      });

      toolManager.registerTool({
        name: 'tool2',
        description: 'Tool 2',
        schema: z.object({}),
        executor: vi.fn(),
      });

      const allTools = toolManager.getAllTools();
      expect(allTools).toHaveLength(2);
      expect(allTools.map(t => t.name)).toEqual(['tool1', 'tool2']);
    });
  });

  describe('Zod to JSON Schema conversion', () => {
    it('should convert string schema', () => {
      const tool: ToolDefinition = {
        name: 'string_tool',
        description: 'Tool with string',
        schema: z.object({
          text: z.string(),
        }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool);
      const ollamaTools = toolManager.getToolsForOllama();

      expect(ollamaTools[0].function.parameters).toEqual({
        type: 'object',
        properties: {
          text: { type: 'string', description: undefined },
        },
        required: ['text'],
      });
    });

    it('should convert number schema', () => {
      const tool: ToolDefinition = {
        name: 'number_tool',
        description: 'Tool with number',
        schema: z.object({
          count: z.number(),
        }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool);
      const ollamaTools = toolManager.getToolsForOllama();

      expect(ollamaTools[0].function.parameters.properties.count).toEqual({
        type: 'number',
        description: undefined,
      });
    });

    it('should convert boolean schema', () => {
      const tool: ToolDefinition = {
        name: 'boolean_tool',
        description: 'Tool with boolean',
        schema: z.object({
          flag: z.boolean(),
        }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool);
      const ollamaTools = toolManager.getToolsForOllama();

      expect(ollamaTools[0].function.parameters.properties.flag).toEqual({
        type: 'boolean',
        description: undefined,
      });
    });

    it('should convert array schema', () => {
      const tool: ToolDefinition = {
        name: 'array_tool',
        description: 'Tool with array',
        schema: z.object({
          items: z.array(z.string()),
        }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool);
      const ollamaTools = toolManager.getToolsForOllama();

      expect(ollamaTools[0].function.parameters.properties.items).toEqual({
        type: 'array',
        items: { type: 'string', description: undefined },
        description: undefined,
      });
    });

    it('should convert enum schema', () => {
      const tool: ToolDefinition = {
        name: 'enum_tool',
        description: 'Tool with enum',
        schema: z.object({
          status: z.enum(['pending', 'completed', 'failed']),
        }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool);
      const ollamaTools = toolManager.getToolsForOllama();

      expect(ollamaTools[0].function.parameters.properties.status).toEqual({
        type: 'string',
        enum: ['pending', 'completed', 'failed'],
        description: undefined,
      });
    });

    it('should handle optional fields', () => {
      const tool: ToolDefinition = {
        name: 'optional_tool',
        description: 'Tool with optional field',
        schema: z.object({
          required: z.string(),
          optional: z.string().optional(),
        }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool);
      const ollamaTools = toolManager.getToolsForOllama();

      expect(ollamaTools[0].function.parameters.required).toEqual(['required']);
    });

    it('should cache schema conversions', () => {
      const tool: ToolDefinition = {
        name: 'cached_tool',
        description: 'Tool for caching test',
        schema: z.object({ a: z.string() }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool);

      // Call multiple times
      const result1 = toolManager.getToolsForOllama();
      const result2 = toolManager.getToolsForOllama();

      // Results should be identical (cached)
      expect(result1[0].function.parameters).toBe(result2[0].function.parameters);
    });

    it('should clear cache on tool re-registration', () => {
      const tool1: ToolDefinition = {
        name: 'tool',
        description: 'First',
        schema: z.object({ a: z.string() }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool1);
      const first = toolManager.getToolsForOllama();

      const tool2: ToolDefinition = {
        name: 'tool',
        description: 'Second',
        schema: z.object({ b: z.number() }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool2);
      const second = toolManager.getToolsForOllama();

      // Schema should be different after re-registration
      expect(first[0].function.parameters).not.toEqual(second[0].function.parameters);
    });
  });

  describe('tool execution', () => {
    it('should execute tool with valid arguments', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({ result: 'success' });

      const tool: ToolDefinition = {
        name: 'exec_tool',
        description: 'Executable tool',
        schema: z.object({
          name: z.string(),
          age: z.number(),
        }),
        executor: mockExecutor,
      };

      toolManager.registerTool(tool);

      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'exec_tool',
          arguments: JSON.stringify({ name: 'John', age: 30 }),
        },
      };

      const result = await toolManager.executeTool(toolCall);

      expect(mockExecutor).toHaveBeenCalledWith({ name: 'John', age: 30 });
      expect(result).toEqual({ result: 'success' });
    });

    it('should validate arguments with Zod schema', async () => {
      const tool: ToolDefinition = {
        name: 'validate_tool',
        description: 'Tool with validation',
        schema: z.object({
          email: z.string().email(),
          age: z.number().min(0).max(150),
        }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool);

      const invalidToolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'validate_tool',
          arguments: JSON.stringify({ email: 'invalid-email', age: 200 }),
        },
      };

      await expect(toolManager.executeTool(invalidToolCall)).rejects.toThrow();
    });

    it('should throw on non-existent tool', async () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'non_existent',
          arguments: '{}',
        },
      };

      await expect(toolManager.executeTool(toolCall)).rejects.toThrow(
        'Tool not found: non_existent'
      );
    });

    it('should throw on invalid JSON arguments', async () => {
      const tool: ToolDefinition = {
        name: 'json_tool',
        description: 'Tool',
        schema: z.object({}),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool);

      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'json_tool',
          arguments: 'invalid json',
        },
      };

      await expect(toolManager.executeTool(toolCall)).rejects.toThrow(
        'Invalid tool arguments JSON'
      );
    });

    it('should handle async executors', async () => {
      const mockExecutor = vi.fn().mockImplementation(async (args: any) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { data: args.input.toUpperCase() };
      });

      const tool: ToolDefinition = {
        name: 'async_tool',
        description: 'Async tool',
        schema: z.object({ input: z.string() }),
        executor: mockExecutor,
      };

      toolManager.registerTool(tool);

      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'async_tool',
          arguments: JSON.stringify({ input: 'hello' }),
        },
      };

      const result = await toolManager.executeTool(toolCall);

      expect(result).toEqual({ data: 'HELLO' });
    });
  });

  describe('parallel tool execution', () => {
    it('should execute multiple tools in parallel', async () => {
      const executor1 = vi.fn().mockResolvedValue('result1');
      const executor2 = vi.fn().mockResolvedValue('result2');

      toolManager.registerTools([
        {
          name: 'tool1',
          description: 'Tool 1',
          schema: z.object({}),
          executor: executor1,
        },
        {
          name: 'tool2',
          description: 'Tool 2',
          schema: z.object({}),
          executor: executor2,
        },
      ]);

      const toolCalls: ToolCall[] = [
        { id: 'call_1', type: 'function', function: { name: 'tool1', arguments: '{}' } },
        { id: 'call_2', type: 'function', function: { name: 'tool2', arguments: '{}' } },
      ];

      const results = await toolManager.executeTools(toolCalls);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ id: 'call_1', result: 'result1' });
      expect(results[1]).toEqual({ id: 'call_2', result: 'result2' });
    });

    it('should handle individual tool failures', async () => {
      const executor1 = vi.fn().mockResolvedValue('success');
      const executor2 = vi.fn().mockRejectedValue(new Error('Tool failed'));

      toolManager.registerTools([
        {
          name: 'tool1',
          description: 'Tool 1',
          schema: z.object({}),
          executor: executor1,
        },
        {
          name: 'tool2',
          description: 'Tool 2',
          schema: z.object({}),
          executor: executor2,
        },
      ]);

      const toolCalls: ToolCall[] = [
        { id: 'call_1', type: 'function', function: { name: 'tool1', arguments: '{}' } },
        { id: 'call_2', type: 'function', function: { name: 'tool2', arguments: '{}' } },
      ];

      const results = await toolManager.executeTools(toolCalls);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ id: 'call_1', result: 'success' });
      expect(results[1]).toEqual({
        id: 'call_2',
        result: null,
        error: 'Tool failed',
      });
    });

    it('should preserve tool call order', async () => {
      const delays = [30, 10, 20];
      const tools = delays.map((delay, i) => ({
        name: `tool${i}`,
        description: `Tool ${i}`,
        schema: z.object({}),
        executor: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, delay));
          return `result${i}`;
        }),
      }));

      toolManager.registerTools(tools);

      const toolCalls: ToolCall[] = tools.map((t, i) => ({
        id: `call_${i}`,
        type: 'function',
        function: { name: t.name, arguments: '{}' },
      }));

      const results = await toolManager.executeTools(toolCalls);

      // Results should be in the same order as calls, despite different execution times
      expect(results.map(r => r.id)).toEqual(['call_0', 'call_1', 'call_2']);
    });

    it('should handle empty tool calls array', async () => {
      const results = await toolManager.executeTools([]);
      expect(results).toEqual([]);
    });
  });

  describe('Ollama format conversion', () => {
    it('should convert to Ollama-compatible format', () => {
      const tool: ToolDefinition = {
        name: 'ollama_tool',
        description: 'A tool for Ollama',
        schema: z.object({
          query: z.string(),
          limit: z.number().optional(),
        }),
        executor: vi.fn(),
      };

      toolManager.registerTool(tool);
      const ollamaTools = toolManager.getToolsForOllama();

      expect(ollamaTools).toHaveLength(1);
      expect(ollamaTools[0]).toEqual({
        type: 'function',
        function: {
          name: 'ollama_tool',
          description: 'A tool for Ollama',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: undefined },
              limit: { type: 'number', description: undefined },
            },
            required: ['query'],
          },
        },
      });
    });

    it('should return empty array when no tools registered', () => {
      const ollamaTools = toolManager.getToolsForOllama();
      expect(ollamaTools).toEqual([]);
    });

    it('should handle multiple tools in Ollama format', () => {
      toolManager.registerTools([
        {
          name: 'tool1',
          description: 'First',
          schema: z.object({ a: z.string() }),
          executor: vi.fn(),
        },
        {
          name: 'tool2',
          description: 'Second',
          schema: z.object({ b: z.number() }),
          executor: vi.fn(),
        },
      ]);

      const ollamaTools = toolManager.getToolsForOllama();

      expect(ollamaTools).toHaveLength(2);
      expect(ollamaTools.every(t => t.type === 'function')).toBe(true);
    });
  });
});
