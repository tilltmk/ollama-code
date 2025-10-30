import { vi } from 'vitest';
import type { ChatCompletionResponse, OllamaListResponse } from '../../src/types/index.js';

/**
 * Mock OllamaClient for testing
 */
export class MockOllamaClient {
  public baseUrl: string;
  public chatCompletion = vi.fn();
  public chatCompletionStream = vi.fn();
  public listModels = vi.fn();
  public healthCheck = vi.fn();

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
    this.setupDefaultBehavior();
  }

  private setupDefaultBehavior() {
    // Default successful responses
    this.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Mock response',
          },
        },
      ],
    } as ChatCompletionResponse);

    this.listModels.mockResolvedValue({
      models: [
        { name: 'test-model', size: 1000000, modified_at: '2024-01-01' },
      ],
    } as OllamaListResponse);

    this.healthCheck.mockResolvedValue(true);
  }

  /**
   * Reset all mocks
   */
  reset() {
    this.chatCompletion.mockReset();
    this.chatCompletionStream.mockReset();
    this.listModels.mockReset();
    this.healthCheck.mockReset();
    this.setupDefaultBehavior();
  }

  /**
   * Mock a tool call response
   */
  mockToolCallResponse(toolCalls: any[]) {
    this.chatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: toolCalls,
          },
        },
      ],
    } as ChatCompletionResponse);
  }

  /**
   * Mock a final text response (no tool calls)
   */
  mockTextResponse(content: string) {
    this.chatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: 'assistant',
            content,
          },
        },
      ],
    } as ChatCompletionResponse);
  }

  /**
   * Mock an error response
   */
  mockError(error: Error) {
    this.chatCompletion.mockRejectedValueOnce(error);
  }
}

/**
 * Create a mock OllamaClient instance
 */
export function createMockOllamaClient(): MockOllamaClient {
  return new MockOllamaClient();
}
