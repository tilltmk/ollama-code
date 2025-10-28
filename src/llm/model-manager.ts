import { OllamaClient } from './ollama-client.js';
import type { Config, OllamaModel } from '../types/index.js';

export interface ModelInfo {
  name: string;
  displayName: string;
  description: string;
  size: number;
  bestFor: string[];
  priority: number; // Lower is higher priority
}

export class ModelManager {
  private client: OllamaClient;
  private config: Config;
  private availableModels: OllamaModel[] = [];

  // Model capabilities and preferences
  private modelPreferences: Record<string, ModelInfo> = {
    'qwen3-coder:30b': {
      name: 'qwen3-coder:30b',
      displayName: 'Qwen3 Coder 30B',
      description: 'Specialized for code generation and editing',
      size: 18,
      bestFor: ['code', 'refactoring', 'debugging'],
      priority: 1,
    },
    'qwen3-coder:latest': {
      name: 'qwen3-coder:latest',
      displayName: 'Qwen3 Coder',
      description: 'Latest Qwen3 Coder model',
      size: 18,
      bestFor: ['code', 'refactoring', 'debugging'],
      priority: 2,
    },
    'gpt-oss:20b': {
      name: 'gpt-oss:20b',
      displayName: 'GPT-OSS 20B',
      description: 'OpenAI open-source model with strong reasoning',
      size: 13,
      bestFor: ['reasoning', 'planning', 'complex-tasks'],
      priority: 3,
    },
    'gpt-oss:latest': {
      name: 'gpt-oss:latest',
      displayName: 'GPT-OSS',
      description: 'Latest GPT-OSS model',
      size: 13,
      bestFor: ['reasoning', 'planning', 'complex-tasks'],
      priority: 4,
    },
    'llama3.1:8b': {
      name: 'llama3.1:8b',
      displayName: 'Llama 3.1 8B',
      description: 'Fast and efficient general-purpose model',
      size: 4.9,
      bestFor: ['general', 'fast-tasks', 'simple-operations'],
      priority: 5,
    },
    'llama3.1:latest': {
      name: 'llama3.1:latest',
      displayName: 'Llama 3.1',
      description: 'Latest Llama 3.1 model',
      size: 4.9,
      bestFor: ['general', 'fast-tasks', 'simple-operations'],
      priority: 6,
    },
  };

  constructor(config: Config) {
    this.client = new OllamaClient(config.ollamaUrl);
    this.config = config;
  }

  /**
   * Initialize model manager by fetching available models
   */
  async initialize(): Promise<void> {
    const response = await this.client.listModels();
    this.availableModels = response.models;
  }

  /**
   * Get all available models from Ollama
   */
  getAvailableModels(): OllamaModel[] {
    return this.availableModels;
  }

  /**
   * Get preferred models that are installed
   */
  getPreferredModels(): OllamaModel[] {
    const preferredNames = Object.keys(this.modelPreferences);
    return this.availableModels
      .filter(model => preferredNames.includes(model.name))
      .sort((a, b) => {
        const aPriority = this.modelPreferences[a.name]?.priority || 999;
        const bPriority = this.modelPreferences[b.name]?.priority || 999;
        return aPriority - bPriority;
      });
  }

  /**
   * Select best model for a specific task type
   */
  selectModelForTask(taskType: 'code' | 'reasoning' | 'general' = 'code'): string {
    const preferred = this.getPreferredModels();

    // Find best model for task type
    for (const model of preferred) {
      const info = this.modelPreferences[model.name];
      if (info && info.bestFor.includes(taskType)) {
        return model.name;
      }
    }

    // Fallback to default or first available
    if (this.config.defaultModel) {
      const exists = this.availableModels.find(m => m.name === this.config.defaultModel);
      if (exists) return this.config.defaultModel;
    }

    const firstPreferred = preferred[0];
    if (firstPreferred) return firstPreferred.name;

    // Last resort: use first available model
    const first = this.availableModels[0];
    if (first) return first.name;

    throw new Error('No models available in Ollama');
  }

  /**
   * Get model information
   */
  getModelInfo(modelName: string): ModelInfo | undefined {
    return this.modelPreferences[modelName];
  }

  /**
   * Check if a specific model is available
   */
  isModelAvailable(modelName: string): boolean {
    return this.availableModels.some(m => m.name === modelName);
  }

  /**
   * Get summary of available models
   */
  getModelsSummary(): string {
    const preferred = this.getPreferredModels();
    if (preferred.length === 0) {
      return 'No preferred models installed. Available models: ' +
        this.availableModels.map(m => m.name).join(', ');
    }

    return preferred.map(m => {
      const info = this.modelPreferences[m.name];
      return `${info.displayName} (${m.name}) - ${info.description}`;
    }).join('\n');
  }
}
