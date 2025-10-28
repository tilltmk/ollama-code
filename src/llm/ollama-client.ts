import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  OllamaListResponse
} from '../types/index.js';

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  /**
   * List all available models from Ollama
   */
  async listModels(): Promise<OllamaListResponse> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }
    return response.json() as Promise<OllamaListResponse>;
  }

  /**
   * Send a chat completion request to Ollama
   * Uses OpenAI-compatible API endpoint
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.statusText} - ${errorText}`);
    }

    return response.json() as Promise<ChatCompletionResponse>;
  }

  /**
   * Send a streaming chat completion request to Ollama
   */
  async *chatCompletionStream(request: ChatCompletionRequest): AsyncGenerator<any, void, unknown> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.statusText} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

        for (const line of lines) {
          const data = line.replace(/^data: /, '').trim();
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
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Check if Ollama is running and accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
