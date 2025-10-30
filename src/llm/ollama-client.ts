import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  OllamaListResponse
} from '../types/index.js';

/**
 * Custom error class for Ollama API errors
 */
class OllamaError extends Error {
  constructor(public statusCode: number, public errorBody: string) {
    super(`Ollama API error (${statusCode}): ${errorBody}`);
    this.name = 'OllamaError';
  }
}

export class OllamaClient {
  private baseUrl: string;
  private readonly DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  /**
   * List all available models from Ollama
   */
  async listModels(timeout: number = this.DEFAULT_TIMEOUT): Promise<OllamaListResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new OllamaError(response.status, errorText);
      }

      return await response.json() as OllamaListResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Send a chat completion request to Ollama
   * Uses OpenAI-compatible API endpoint
   */
  async chatCompletion(request: ChatCompletionRequest, timeout: number = this.DEFAULT_TIMEOUT): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Debug logging
      console.log('[DEBUG] Sending request to Ollama:', {
        url: `${this.baseUrl}/v1/chat/completions`,
        model: request.model,
        messagesCount: request.messages?.length || 0,
        hasTools: !!request.tools,
        timeout: timeout
      });

      const requestBody = JSON.stringify(request);
      console.log('[DEBUG] Request size:', requestBody.length, 'bytes');

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
        signal: controller.signal,
      });

      console.log('[DEBUG] Response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DEBUG] Error response body:', errorText);
        throw new OllamaError(response.status, errorText);
      }

      const result = await response.json() as ChatCompletionResponse;
      console.log('[DEBUG] Response parsed successfully');
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Send a streaming chat completion request to Ollama
   */
  async *chatCompletionStream(request: ChatCompletionRequest, timeout: number = this.DEFAULT_TIMEOUT): AsyncGenerator<any, void, unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new OllamaError(response.status, errorText);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from buffer
        const lines = buffer.split('\n');
        // Keep last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data: ')) continue;

          const data = trimmedLine.replace(/^data: /, '').trim();
          if (data === '[DONE]') continue;
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch (e) {
            console.error('Failed to parse chunk:', data);
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const trimmedLine = buffer.trim();
        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.replace(/^data: /, '').trim();
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              yield parsed;
            } catch (e) {
              console.error('Failed to parse final chunk:', data);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Streaming request timeout after ${timeout}ms`);
      }
      throw error;
    } finally {
      if (reader) {
        reader.releaseLock();
      }
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if Ollama is running and accessible
   */
  async healthCheck(timeout: number = this.DEFAULT_TIMEOUT): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch (error) {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
