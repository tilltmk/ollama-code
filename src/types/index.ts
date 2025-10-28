// Core types for Ollama Code

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  tools?: Tool[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: Message;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
}

export interface OllamaListResponse {
  models: OllamaModel[];
}

export interface Config {
  ollamaUrl: string;
  defaultModel: string;
  availableModels: string[];
  temperature: number;
  maxTokens: number;
}

export type ToolExecutor = (args: any) => Promise<any>;

export interface ToolDefinition {
  name: string;
  description: string;
  schema: any; // Zod schema
  executor: ToolExecutor;
}
