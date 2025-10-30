import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Agent } from './agent.js';
import type { Config } from '../types/index.js';
import type { ToolManager } from '../tools/tool-manager.js';
import type { ModelManager } from './model-manager.js';

describe('Agent', () => {
  let agent: Agent;
  let mockConfig: Config;
  let mockToolManager: ToolManager;
  let mockModelManager: ModelManager;
  let mockOllamaClient: any;

  beforeEach(() => {
    // Create mock config
    mockConfig = {
      ollamaUrl: 'http://localhost:11434',
      defaultModel: 'test-model',
      availableModels: [],
      temperature: 0.7,
      maxTokens: 1000,
    };

    // Create mock tool manager
    mockToolManager = {
      getToolsForOllama: vi.fn().mockReturnValue([]),
      executeTools: vi.fn().mockResolvedValue([]),
      getAllTools: vi.fn().mockReturnValue([]),
      registerTool: vi.fn(),
      registerTools: vi.fn(),
      getTool: vi.fn(),
      executeTool: vi.fn(),
    } as any;

    // Create mock model manager
    mockModelManager = {
      selectModelForTask: vi.fn().mockReturnValue('test-model'),
      listModels: vi.fn(),
      getModel: vi.fn(),
    } as any;

    // Create agent
    agent = new Agent(mockConfig, mockToolManager, mockModelManager);

    // Mock the internal OllamaClient
    mockOllamaClient = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Mock response',
            },
          },
        ],
      }),
    };

    // Replace the internal client
    (agent as any).client = mockOllamaClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('conversation history management', () => {
    it('should initialize with empty history', () => {
      expect(agent.getHistory()).toEqual([]);
    });

    it('should add user messages to history', () => {
      agent.addUserMessage('Hello');
      const history = agent.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        role: 'user',
        content: 'Hello',
      });
    });

    it('should set system prompt', () => {
      agent.setSystemPrompt('You are a helpful assistant');
      const history = agent.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant',
      });
    });

    it('should replace existing system prompt when setting new one', () => {
      agent.setSystemPrompt('First prompt');
      agent.setSystemPrompt('Second prompt');
      const history = agent.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Second prompt');
    });

    it('should clear history but keep system prompt', () => {
      agent.setSystemPrompt('System prompt');
      agent.addUserMessage('User message');

      agent.clearHistory();
      const history = agent.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('system');
    });

    it('should compress history when exceeding MAX_HISTORY_SIZE', () => {
      // Add system prompt first
      agent.setSystemPrompt('System');

      // Add 60 messages (exceeds MAX_HISTORY_SIZE of 50)
      for (let i = 0; i < 60; i++) {
        agent.addUserMessage(`Message ${i}`);
      }

      // Trigger compression by calling run
      mockOllamaClient.chatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Response',
            },
          },
        ],
      });

      agent.run('Test', { maxIterations: 1 }).then(() => {
        const history = agent.getHistory();
        // Should have system message + compressed messages
        expect(history.length).toBeLessThanOrEqual(32); // system + 30 + user message
        expect(history[0].role).toBe('system');
      });
    });

    it('should handle empty history gracefully', () => {
      agent.clearHistory();
      expect(agent.getHistory()).toEqual([]);
    });

    it('should preserve message order', () => {
      agent.addUserMessage('First');
      agent.addUserMessage('Second');
      agent.addUserMessage('Third');

      const history = agent.getHistory();
      expect(history.map(m => m.content)).toEqual(['First', 'Second', 'Third']);
    });
  });

  describe('thinking/reasoning extraction', () => {
    it('should extract thinking tags from message', async () => {
      mockOllamaClient.chatCompletion.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '<thinking>Internal reasoning</thinking>Final response',
            },
          },
        ],
      });

      await agent.run('Test message', { maxIterations: 1 });

      const history = agent.getHistory();
      const lastMessage = history[history.length - 1];

      expect(lastMessage.thinking).toBe('Internal reasoning');
      expect(lastMessage.content).toBe('Final response');
    });

    it('should extract reasoning tags from message', async () => {
      mockOllamaClient.chatCompletion.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '<reasoning>My reasoning</reasoning>Final answer',
            },
          },
        ],
      });

      await agent.run('Test message', { maxIterations: 1 });

      const history = agent.getHistory();
      const lastMessage = history[history.length - 1];

      expect(lastMessage.thinking).toBe('My reasoning');
      expect(lastMessage.content).toBe('Final answer');
    });

    it('should handle messages without thinking tags', async () => {
      mockOllamaClient.chatCompletion.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Just a plain response',
            },
          },
        ],
      });

      await agent.run('Test message', { maxIterations: 1 });

      const history = agent.getHistory();
      const lastMessage = history[history.length - 1];

      expect(lastMessage.thinking).toBeUndefined();
      expect(lastMessage.content).toBe('Just a plain response');
    });

    it('should get last thinking from history', async () => {
      mockOllamaClient.chatCompletion.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '<thinking>Latest thinking</thinking>Response',
            },
          },
        ],
      });

      await agent.run('Test message', { maxIterations: 1 });

      expect(agent.getLastThinking()).toBe('Latest thinking');
    });

    it('should return undefined when no thinking exists', () => {
      expect(agent.getLastThinking()).toBeUndefined();
    });
  });

  describe('tool execution', () => {
    it('should execute tool calls and continue conversation', async () => {
      // First response with tool call
      mockOllamaClient.chatCompletion
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call_1',
                    function: {
                      name: 'test_tool',
                      arguments: '{"arg": "value"}',
                    },
                  },
                ],
              },
            },
          ],
        })
        // Second response after tool execution
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Final response after tool',
              },
            },
          ],
        });

      mockToolManager.executeTools = vi.fn().mockResolvedValue([
        {
          id: 'call_1',
          result: { success: true },
        },
      ]);

      const response = await agent.run('Test with tools', { maxIterations: 5 });

      expect(mockToolManager.executeTools).toHaveBeenCalledTimes(1);
      expect(response).toBe('Final response after tool');
    });

    it('should add tool results to conversation history', async () => {
      mockOllamaClient.chatCompletion
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call_1',
                    function: {
                      name: 'test_tool',
                      arguments: '{}',
                    },
                  },
                ],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Done',
              },
            },
          ],
        });

      mockToolManager.executeTools = vi.fn().mockResolvedValue([
        {
          id: 'call_1',
          result: { data: 'tool result' },
        },
      ]);

      await agent.run('Test', { maxIterations: 5 });

      const history = agent.getHistory();
      const toolMessage = history.find(m => m.role === 'tool');

      expect(toolMessage).toBeDefined();
      expect(toolMessage?.tool_call_id).toBe('call_1');
    });

    it('should handle tool execution errors gracefully', async () => {
      mockOllamaClient.chatCompletion
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call_1',
                    function: {
                      name: 'failing_tool',
                      arguments: '{}',
                    },
                  },
                ],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Handled error',
              },
            },
          ],
        });

      mockToolManager.executeTools = vi.fn().mockResolvedValue([
        {
          id: 'call_1',
          result: null,
          error: 'Tool execution failed',
        },
      ]);

      const response = await agent.run('Test', { maxIterations: 5 });

      expect(response).toBe('Handled error');
    });
  });

  describe('retry mechanism', () => {
    it('should retry on API failures', async () => {
      // Fail twice, then succeed
      mockOllamaClient.chatCompletion
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Success after retries',
              },
            },
          ],
        });

      const response = await agent.run('Test', { maxRetries: 3, maxIterations: 1 });

      expect(response).toBe('Success after retries');
      expect(mockOllamaClient.chatCompletion).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries exceeded', async () => {
      mockOllamaClient.chatCompletion.mockRejectedValue(new Error('Persistent error'));

      await expect(agent.run('Test', { maxRetries: 2, maxIterations: 1 })).rejects.toThrow(
        'Persistent error'
      );
    });
  });

  describe('iteration limits', () => {
    it('should stop after max iterations', async () => {
      // Always return tool calls to force continuation
      mockOllamaClient.chatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  function: {
                    name: 'tool',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      });

      mockToolManager.executeTools = vi.fn().mockResolvedValue([
        {
          id: 'call_1',
          result: {},
        },
      ]);

      const response = await agent.run('Test', { maxIterations: 3 });

      expect(response).toContain('maximum iterations limit');
    });

    it('should use custom max iterations', async () => {
      mockOllamaClient.chatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{ id: '1', function: { name: 't', arguments: '{}' } }],
            },
          },
        ],
      });

      mockToolManager.executeTools = vi.fn().mockResolvedValue([{ id: '1', result: {} }]);

      await agent.run('Test', { maxIterations: 2 });

      // Should stop after 2 iterations
      expect(mockOllamaClient.chatCompletion).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should throw on invalid API response structure', async () => {
      mockOllamaClient.chatCompletion.mockResolvedValue({
        // Missing choices array
      });

      await expect(agent.run('Test', { maxIterations: 1 })).rejects.toThrow(
        'Invalid API response'
      );
    });

    it('should throw on empty choices array', async () => {
      mockOllamaClient.chatCompletion.mockResolvedValue({
        choices: [],
      });

      await expect(agent.run('Test', { maxIterations: 1 })).rejects.toThrow(
        'Invalid API response'
      );
    });
  });
});
