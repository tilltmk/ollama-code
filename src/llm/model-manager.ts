import { OllamaClient } from './ollama-client.js';
import type { Config, OllamaModel } from '../types/index.js';
import { MODEL_SCORING } from '../constants/index.js';

export interface ModelInfo {
  name: string;
  displayName: string;
  description: string;
  size: number;
  bestFor: string[];
  priority: number; // Lower is higher priority
}

export interface TaskContext {
  type: string; // Dynamic - not limited to hardcoded values
  complexity?: 'low' | 'medium' | 'high';
  estimatedTokens?: number;
  timeConstraint?: number; // milliseconds
  priority?: 'speed' | 'balanced' | 'quality';
}

export interface ModelMetrics {
  totalRequests: number;
  totalErrors: number;
  avgResponseTime: number;
  lastUsed: number;
  tokenUsage: number;
  errorRate?: number;
}

export class ModelManager {
  private client: OllamaClient;
  private availableModels: OllamaModel[] = [];

  // Model capabilities and preferences
  private modelPreferences: Record<string, ModelInfo> = {
    'granite': {
      name: 'granite',
      displayName: 'Granite',
      description: 'IBM Granite model for enterprise AI',
      size: 7,
      bestFor: ['general', 'business', 'enterprise'],
      priority: 4,
    },
    'granite:latest': {
      name: 'granite:latest',
      displayName: 'Granite Latest',
      description: 'IBM Granite model for enterprise AI',
      size: 7,
      bestFor: ['general', 'business', 'enterprise'],
      priority: 4,
    },
    'granite3-dense': {
      name: 'granite3-dense',
      displayName: 'Granite3 Dense',
      description: 'IBM Granite3 Dense model',
      size: 8,
      bestFor: ['code', 'reasoning', 'analysis'],
      priority: 3,
    },
    'qwen3-coder:30b': {
      name: 'qwen3-coder:30b',
      displayName: 'Qwen3 Coder 30B',
      description: 'Specialized for code generation and editing',
      size: 18,
      bestFor: ['code', 'refactoring', 'debugging'],
      priority: 1,
    },
    'qwen2.5-coder': {
      name: 'qwen2.5-coder',
      displayName: 'Qwen2.5 Coder',
      description: 'Latest Qwen coder model',
      size: 7,
      bestFor: ['code', 'refactoring', 'debugging'],
      priority: 2,
    },
    'deepseek-coder': {
      name: 'deepseek-coder',
      displayName: 'DeepSeek Coder',
      description: 'Specialized coding model',
      size: 6.7,
      bestFor: ['code', 'debugging', 'optimization'],
      priority: 2,
    },
    'codellama': {
      name: 'codellama',
      displayName: 'Code Llama',
      description: 'Meta code generation model',
      size: 7,
      bestFor: ['code', 'python', 'javascript'],
      priority: 3,
    },
    'mistral': {
      name: 'mistral',
      displayName: 'Mistral',
      description: 'Fast and efficient model',
      size: 7,
      bestFor: ['general', 'reasoning', 'fast-tasks'],
      priority: 3,
    },
    'mixtral': {
      name: 'mixtral',
      displayName: 'Mixtral',
      description: 'MoE model with strong capabilities',
      size: 47,
      bestFor: ['complex-tasks', 'reasoning', 'analysis'],
      priority: 2,
    },
    'gpt-oss:20b': {
      name: 'gpt-oss:20b',
      displayName: 'GPT-OSS 20B',
      description: 'OpenAI open-source model with strong reasoning',
      size: 13,
      bestFor: ['reasoning', 'planning', 'complex-tasks'],
      priority: 2,
    },
    'llama3.1': {
      name: 'llama3.1',
      displayName: 'Llama 3.1',
      description: 'Latest Llama model',
      size: 8,
      bestFor: ['general', 'reasoning', 'chat'],
      priority: 3,
    },
    'llama3.1:8b': {
      name: 'llama3.1:8b',
      displayName: 'Llama 3.1 8B',
      description: 'Fast and efficient general-purpose model',
      size: 4.9,
      bestFor: ['general', 'fast-tasks', 'simple-operations'],
      priority: 3,
    },
    'llama3.1:latest': {
      name: 'llama3.1:latest',
      displayName: 'Llama 3.1 Latest',
      description: 'Fast and efficient general-purpose model',
      size: 4.9,
      bestFor: ['general', 'fast-tasks', 'simple-operations'],
      priority: 3,
    },
  };

  // Performance metrics tracking
  private modelMetrics: Map<string, ModelMetrics> = new Map();

  constructor(config: Config) {
    this.client = new OllamaClient(config.ollamaUrl);
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
   * Select best model for a task context (supports dynamic task types and adaptive selection)
   */
  selectModelForTask(context: TaskContext | string): string {
    // Normalize input to TaskContext
    const ctx = typeof context === 'string'
      ? { type: context }
      : context;

    const preferred = this.getPreferredModels();

    // If no preferred models found, use any available model
    if (preferred.length === 0) {
      if (this.availableModels.length === 0) {
        throw new Error('No models available in Ollama');
      }
      // Return the first available model
      console.log('[ModelManager] No preferred models found, using:', this.availableModels[0].name);
      return this.availableModels[0].name;
    }

    // Speed priority: select fastest model by average response time
    if (ctx.priority === 'speed') {
      return this.selectFastestModel(preferred);
    }

    // Quality priority: select most accurate model by error rate
    if (ctx.priority === 'quality') {
      return this.selectMostReliableModel(preferred);
    }

    // Default balanced approach: find best model for task type with metrics consideration
    return this.selectBalancedModel(preferred, ctx);
  }

  /**
   * Select fastest available model based on metrics
   */
  private selectFastestModel(candidates: OllamaModel[]): string {
    let fastest = candidates[0];
    let fastestTime = Infinity;

    for (const model of candidates) {
      const metrics = this.modelMetrics.get(model.name);
      const avgTime = metrics?.avgResponseTime ?? Infinity;
      if (avgTime < fastestTime) {
        fastestTime = avgTime;
        fastest = model;
      }
    }

    return fastest.name;
  }

  /**
   * Select most reliable model based on error rate
   */
  private selectMostReliableModel(candidates: OllamaModel[]): string {
    let mostReliable = candidates[0];
    let lowestErrorRate = 1;

    for (const model of candidates) {
      const metrics = this.modelMetrics.get(model.name);
      const errorRate = metrics?.errorRate ?? 0;
      if (errorRate < lowestErrorRate) {
        lowestErrorRate = errorRate;
        mostReliable = model;
      }
    }

    return mostReliable.name;
  }

  /**
   * Select model with balanced scoring based on task type and metrics
   */
  private selectBalancedModel(candidates: OllamaModel[], ctx: TaskContext): string {
    let bestModel = candidates[0];
    let bestScore = -Infinity;

    for (const model of candidates) {
      const info = this.modelPreferences[model.name];
      const metrics = this.modelMetrics.get(model.name);

      // Score based on task type match
      let typeScore = info?.bestFor.includes(ctx.type) ? MODEL_SCORING.BEST_FOR_SCORE : 0;

      // Score based on priority (lower is better)
      let priorityScore = (1 - (info?.priority ?? 999) / 999) * 30;

      // Score based on metrics
      let metricsScore = 0;
      if (metrics) {
        const errorRate = metrics.errorRate ?? 0;
        const responseScore = Math.max(0, 100 - metrics.avgResponseTime);
        metricsScore = ((1 - errorRate) * responseScore) / 100 * 20;
      }

      const totalScore = typeScore + priorityScore + metricsScore;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestModel = model;
      }
    }

    return bestModel.name;
  }

  /**
   * Record performance metrics for a model
   */
  recordMetrics(model: string, duration: number, tokens: number, error?: boolean): void {
    const existing = this.modelMetrics.get(model) || {
      totalRequests: 0,
      totalErrors: 0,
      avgResponseTime: 0,
      lastUsed: Date.now(),
      tokenUsage: 0,
    };

    existing.totalRequests++;
    if (error) {
      existing.totalErrors++;
    }

    // Update average response time
    existing.avgResponseTime =
      (existing.avgResponseTime * (existing.totalRequests - 1) + duration) /
      existing.totalRequests;

    // Update error rate
    existing.errorRate = existing.totalRequests > 0
      ? existing.totalErrors / existing.totalRequests
      : 0;

    existing.tokenUsage += tokens;
    existing.lastUsed = Date.now();

    this.modelMetrics.set(model, existing);
  }

  /**
   * Get metrics for a specific model
   */
  getModelMetrics(model: string): ModelMetrics | undefined {
    return this.modelMetrics.get(model);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, ModelMetrics> {
    const result: Record<string, ModelMetrics> = {};
    this.modelMetrics.forEach((metrics, model) => {
      result[model] = metrics;
    });
    return result;
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
