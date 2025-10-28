/**
 * Sub-Agent System
 * Allows main agent to delegate tasks to specialized Ollama sub-agents
 */

import { Agent, AgentConfig } from './agent.js';
import { ModelManager } from './model-manager.js';
import { ToolManager } from '../tools/tool-manager.js';
import type { Config } from '../types/index.js';

export interface SubAgentTask {
  id: string;
  description: string;
  model?: string;
  systemPrompt?: string;
  priority?: number;
}

export interface SubAgentResult {
  id: string;
  success: boolean;
  result?: string;
  error?: string;
  duration: number;
}

export class SubAgentOrchestrator {
  private config: Config;
  private toolManager: ToolManager;
  private modelManager: ModelManager;

  constructor(config: Config, toolManager: ToolManager, modelManager: ModelManager) {
    this.config = config;
    this.toolManager = toolManager;
    this.modelManager = modelManager;
  }

  /**
   * Execute a single sub-agent task
   */
  private async executeTask(task: SubAgentTask, verbose: boolean = false): Promise<SubAgentResult> {
    const startTime = Date.now();

    try {
      // Create dedicated sub-agent
      const subAgent = new Agent(this.config, this.toolManager, this.modelManager);

      // Configure sub-agent
      const agentConfig: AgentConfig = {
        model: task.model,
        systemPrompt: task.systemPrompt,
        verbose: verbose,
        maxIterations: 5, // Sub-agents get fewer iterations
      };

      // Run task
      const result = await subAgent.run(task.description, agentConfig);

      return {
        id: task.id,
        success: true,
        result,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        id: task.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeParallel(tasks: SubAgentTask[], verbose: boolean = false): Promise<SubAgentResult[]> {
    if (verbose) {
      console.log(`[Sub-Agents] Executing ${tasks.length} tasks in parallel...`);
    }

    const promises = tasks.map(task => this.executeTask(task, verbose));
    const results = await Promise.all(promises);

    if (verbose) {
      console.log(`[Sub-Agents] Completed ${results.filter(r => r.success).length}/${results.length} successfully`);
    }

    return results;
  }

  /**
   * Execute tasks sequentially (for dependent tasks)
   */
  async executeSequential(tasks: SubAgentTask[], verbose: boolean = false): Promise<SubAgentResult[]> {
    if (verbose) {
      console.log(`[Sub-Agents] Executing ${tasks.length} tasks sequentially...`);
    }

    const results: SubAgentResult[] = [];

    for (const task of tasks) {
      const result = await this.executeTask(task, verbose);
      results.push(result);

      // Stop on first failure if sequential
      if (!result.success) {
        if (verbose) {
          console.log(`[Sub-Agents] Task ${task.id} failed, stopping sequential execution`);
        }
        break;
      }
    }

    return results;
  }

  /**
   * Smart execution - auto-decides parallel vs sequential based on priority
   */
  async executeSmart(tasks: SubAgentTask[], verbose: boolean = false): Promise<SubAgentResult[]> {
    // Group by priority
    const priorityGroups = new Map<number, SubAgentTask[]>();

    for (const task of tasks) {
      const priority = task.priority ?? 0;
      if (!priorityGroups.has(priority)) {
        priorityGroups.set(priority, []);
      }
      priorityGroups.get(priority)!.push(task);
    }

    // Execute priority groups sequentially, tasks within group in parallel
    const allResults: SubAgentResult[] = [];
    const sortedPriorities = Array.from(priorityGroups.keys()).sort((a, b) => b - a);

    for (const priority of sortedPriorities) {
      const group = priorityGroups.get(priority)!;
      if (verbose) {
        console.log(`[Sub-Agents] Executing priority ${priority} group (${group.length} tasks)...`);
      }
      const results = await this.executeParallel(group, verbose);
      allResults.push(...results);
    }

    return allResults;
  }
}

/**
 * Helper to create sub-agent tasks
 */
export function createSubAgentTask(
  description: string,
  options: Partial<SubAgentTask> = {}
): SubAgentTask {
  return {
    id: options.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    description,
    model: options.model,
    systemPrompt: options.systemPrompt,
    priority: options.priority ?? 0
  };
}

/**
 * Specialized sub-agent types
 */
export const SubAgentTypes = {
  CodeReviewer: {
    model: 'qwen3-coder:30b',
    systemPrompt: 'You are a code review specialist. Analyze code for bugs, improvements, and best practices.'
  },
  FastExecutor: {
    model: 'granite4:micro',
    systemPrompt: 'You are a fast task executor. Complete tasks quickly and efficiently.'
  },
  Reasoner: {
    model: 'gpt-oss:20b',
    systemPrompt: 'You are a reasoning specialist. Think through complex problems step by step.'
  },
  FileExpert: {
    model: 'granite4:micro',
    systemPrompt: 'You are a file operations specialist. Handle file reading, writing, and searching.'
  }
};
