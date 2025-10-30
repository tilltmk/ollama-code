/**
 * Callback Loop System
 * Enables automatic Claude ↔ Ollama handoff to prevent connection timeouts
 *
 * Flow:
 * 1. Claude creates tasks and delegates
 * 2. Ollama agents work autonomously
 * 3. Results reported back to Claude via prompt
 * 4. Claude reviews and creates new tasks
 * 5. Loop until completion
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Agent } from './agent.js';
import type { Config } from '../types/index.js';
import { ToolManager } from '../tools/tool-manager.js';
import { ModelManager } from './model-manager.js';
import { DEFAULTS } from '../constants/index.js';

export interface CallbackTask {
  id: string;
  type: 'execute' | 'review' | 'delegate';
  description: string;
  priority: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  agent: 'claude' | 'ollama';
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CallbackLoopOptions {
  workDir?: string;
  maxIterations?: number;
  verbose?: boolean;
  claudeModel?: string;
  ollamaModel?: string;
  autoSave?: boolean;
}

export class CallbackLoop {
  private config: Config;
  private toolManager: ToolManager;
  private modelManager: ModelManager;
  private workDir: string;
  private tasks: CallbackTask[] = [];
  private iteration: number = 0;
  private maxIterations: number;
  private verbose: boolean;
  private claudeModel: string;
  private ollamaModel: string;
  private autoSave: boolean;
  private saveMutex: Promise<void> = Promise.resolve();
  private isSaving: boolean = false;
  private taskHashes: Set<string> = new Set();

  constructor(
    config: Config,
    toolManager: ToolManager,
    modelManager: ModelManager,
    options: CallbackLoopOptions = {}
  ) {
    this.config = config;
    this.toolManager = toolManager;
    this.modelManager = modelManager;
    this.workDir = options.workDir || path.join(process.cwd(), DEFAULTS.CALLBACK.WORK_DIR);
    this.maxIterations = options.maxIterations || DEFAULTS.CALLBACK.MAX_ITERATIONS;
    this.verbose = options.verbose || false;
    this.claudeModel = options.claudeModel || 'claude-sonnet-3.5';
    this.ollamaModel = options.ollamaModel || ''; // Will be set during initialize()
    this.autoSave = options.autoSave !== false; // Default true
  }

  /**
   * Initialize the callback loop system
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.workDir, { recursive: true });

    // Select model if not already set
    if (!this.ollamaModel) {
      this.ollamaModel = this.modelManager.selectModelForTask('code');
    }

    // Load existing tasks if any
    const queueFile = path.join(this.workDir, DEFAULTS.CALLBACK.QUEUE_FILE);
    try {
      const data = await fs.readFile(queueFile, 'utf-8');
      const saved = JSON.parse(data);
      this.tasks = saved.tasks || [];
      this.iteration = saved.iteration || 0;

      // Rebuild task hash set
      this.taskHashes.clear();
      for (const task of this.tasks) {
        const hash = this.getTaskHash(task.description, task.type);
        this.taskHashes.add(hash);
      }

      if (this.verbose) {
        console.log(`[Callback Loop] Loaded ${this.tasks.length} tasks from previous session`);
      }
    } catch {
      // No previous queue, start fresh
      if (this.verbose) {
        console.log('[Callback Loop] Starting fresh queue');
      }
    }
  }

  /**
   * Generate hash for task deduplication
   */
  private getTaskHash(description: string, type: string): string {
    return crypto.createHash('md5')
      .update(`${description}:${type}`)
      .digest('hex');
  }

  /**
   * Save current state with atomic file operations and mutex lock
   * Prevents race conditions from concurrent saves
   */
  private async save(): Promise<void> {
    if (!this.autoSave || this.isSaving) return;

    this.isSaving = true;
    this.saveMutex = this.saveMutex.then(async () => {
      try {
        const queueFile = path.join(this.workDir, 'task-queue.json');
        const tempFile = queueFile + '.tmp';

        // Write to temp file first
        await fs.writeFile(tempFile, JSON.stringify({
          tasks: this.tasks,
          iteration: this.iteration,
          timestamp: Date.now()
        }, null, 2));

        // Atomic rename - ensures file is never corrupted
        await fs.rename(tempFile, queueFile);
      } catch (error) {
        if (this.verbose) {
          console.error('[Callback Loop] Save error:', error);
        }
      } finally {
        this.isSaving = false;
      }
    });

    return this.saveMutex;
  }

  /**
   * Atomically update task status with validation
   * Prevents invalid state transitions
   */
  private async updateTaskStatus(
    taskId: string,
    fromStatus: CallbackTask['status'],
    toStatus: CallbackTask['status'],
    updates?: Partial<CallbackTask>
  ): Promise<void> {
    const task = this.tasks.find(t => t.id === taskId);

    if (!task || task.status !== fromStatus) {
      throw new Error(`Cannot transition task ${taskId} from ${fromStatus} to ${toStatus} (current: ${task?.status})`);
    }

    Object.assign(task, {
      status: toStatus,
      ...updates,
      updatedAt: Date.now()
    });

    await this.save();
  }

  /**
   * Add a task to the queue
   */
  addTask(
    description: string,
    type: CallbackTask['type'] = 'execute',
    agent: 'claude' | 'ollama' = 'ollama',
    priority: number = 5
  ): string {
    // Check for duplicate task
    const hash = this.getTaskHash(description, type);

    if (this.taskHashes.has(hash)) {
      const existing = this.tasks.find(t =>
        this.getTaskHash(t.description, t.type) === hash
      );
      if (existing) {
        if (this.verbose) {
          console.log(`[Callback Loop] Skipping duplicate task: ${existing.id}`);
        }
        return existing.id;
      }
    }

    // Create new task
    const task: CallbackTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      description,
      priority,
      status: 'pending',
      agent,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.tasks.push(task);
    this.taskHashes.add(hash);

    if (this.verbose) {
      console.log(`[Callback Loop] Added task ${task.id}: ${description.substring(0, 50)}...`);
    }

    return task.id;
  }

  /**
   * Get next task to execute
   *
   * PERFORMANCE: O(n) single pass instead of O(n log n) sort
   * Just find the maximum priority task, no need to sort entire array
   */
  private getNextTask(): CallbackTask | null {
    let best: CallbackTask | null = null;

    for (const task of this.tasks) {
      if (task.status !== 'pending') continue;

      if (!best ||
          task.priority > best.priority ||
          (task.priority === best.priority && task.createdAt < best.createdAt)) {
        best = task;
      }
    }

    return best;
  }

  /**
   * Execute a task with the appropriate agent
   * Includes timeout protection and atomic state transitions
   */
  private async executeTask(task: CallbackTask): Promise<void> {
    // Atomic transition to in_progress
    await this.updateTaskStatus(task.id, 'pending', 'in_progress');

    if (this.verbose) {
      console.log(`\n[Iteration ${this.iteration}] Executing ${task.type} task (${task.agent})`);
      console.log(`  Task: ${task.description}`);
    }

    const timeout = 5 * 60 * 1000; // 5 minutes timeout
    const startTime = Date.now();

    try {
      if (task.agent === 'ollama') {
        // Execute with Ollama agent with timeout protection
        const agent = new Agent(this.config, this.toolManager, this.modelManager);

        const result = await Promise.race([
          agent.run(task.description, {
            model: this.ollamaModel,
            verbose: this.verbose,
            maxRetries: 3,
            maxIterations: 10
          }),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Task timeout after 5 minutes')), timeout)
          )
        ]);

        // Atomic transition to completed
        await this.updateTaskStatus(task.id, 'in_progress', 'completed', {
          result: result
        });

        if (this.verbose) {
          console.log(`  ✓ Completed in ${Date.now() - startTime}ms`);
        }

        // Create review task for Claude
        if (task.type === 'execute') {
          this.addTask(
            `Review the following execution result and decide next steps:\n\nOriginal Task: ${task.description}\n\nResult:\n${result}\n\nProvide feedback and create new tasks if needed, or respond with "DONE" if complete.`,
            'review',
            'claude',
            task.priority
          );
        }

      } else if (task.agent === 'claude') {
        // For Claude tasks, we generate a prompt that external Claude can process
        const claudePrompt = `[Awaiting Claude response for: ${task.description}]`;

        // Atomic transition to completed
        await this.updateTaskStatus(task.id, 'in_progress', 'completed', {
          result: claudePrompt
        });

        if (this.verbose) {
          console.log(`  → Prepared prompt for Claude`);
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Atomic transition to failed
      await this.updateTaskStatus(task.id, 'in_progress', 'failed', {
        error: errorMessage
      });

      if (this.verbose) {
        console.log(`  ✗ Failed: ${errorMessage}`);
      }

      // Create retry task with lower priority
      if (task.priority > 1) {
        this.addTask(
          `Retry failed task: ${task.description}\n\nPrevious error: ${errorMessage}`,
          task.type,
          task.agent,
          task.priority - 1
        );
      }
    }
  }

  /**
   * Process Claude's response and extract new tasks
   */
  processClaudeResponse(response: string): void {
    if (this.verbose) {
      console.log('[Callback Loop] Processing Claude response...');
    }

    // Check for completion signal
    if (response.toUpperCase().includes('DONE')) {
      if (this.verbose) {
        console.log('  → Claude signaled completion');
      }
      return;
    }

    // Parse response for new tasks (simple format for now)
    // Format: TASK[priority]: description
    const taskPattern = /TASK\[(\d+)\]:\s*(.+)/gi;
    let match;
    let tasksAdded = 0;

    while ((match = taskPattern.exec(response)) !== null) {
      const priority = parseInt(match[1]);
      const description = match[2].trim();
      this.addTask(description, 'execute', 'ollama', priority);
      tasksAdded++;
    }

    if (this.verbose) {
      console.log(`  → Extracted ${tasksAdded} new tasks from Claude response`);
    }

    // If no structured tasks found but response is meaningful, create a general task
    if (tasksAdded === 0 && response.length > 20) {
      this.addTask(response, 'execute', 'ollama', 5);
      if (this.verbose) {
        console.log('  → Created general task from response');
      }
    }
  }

  /**
   * Run the callback loop until completion or max iterations
   */
  async run(initialTask?: string): Promise<string> {
    await this.initialize();

    if (initialTask) {
      this.addTask(initialTask, 'execute', 'ollama', 10);
    }

    if (this.tasks.length === 0) {
      throw new Error('No tasks to execute');
    }

    console.log(`[Callback Loop] Starting execution (max ${this.maxIterations} iterations)`);
    console.log(`  Tasks in queue: ${this.tasks.length}`);
    console.log(`  Ollama model: ${this.ollamaModel}`);
    console.log(`  Claude model: ${this.claudeModel}`);

    while (this.iteration < this.maxIterations) {
      this.iteration++;

      const task = this.getNextTask();
      if (!task) {
        // No pending tasks, check if all completed
        const incomplete = this.tasks.filter(t =>
          t.status === 'in_progress' || t.status === 'failed'
        );

        if (incomplete.length === 0) {
          console.log(`\n[Callback Loop] ✓ All tasks completed in ${this.iteration} iterations`);
          break;
        } else {
          console.log(`\n[Callback Loop] ⚠ No pending tasks, but ${incomplete.length} incomplete`);
          break;
        }
      }

      await this.executeTask(task);

      // Check if we should pause for Claude input
      if (task.agent === 'claude' && task.status === 'completed') {
        console.log('\n[Callback Loop] ⏸️  Paused - Awaiting Claude response');
        console.log('  Use processClaudeResponse() to continue with Claude\'s feedback');
        break;
      }
    }

    // Generate summary
    const completed = this.tasks.filter(t => t.status === 'completed').length;
    const failed = this.tasks.filter(t => t.status === 'failed').length;
    const pending = this.tasks.filter(t => t.status === 'pending').length;

    const summary = `
Callback Loop Summary:
  Total iterations: ${this.iteration}
  Tasks completed: ${completed}
  Tasks failed: ${failed}
  Tasks pending: ${pending}

Results available in: ${this.workDir}
`;

    await this.save();
    return summary;
  }

  /**
   * Get all task results
   */
  getResults(): CallbackTask[] {
    return this.tasks;
  }

  /**
   * Export results to file
   */
  async exportResults(filepath?: string): Promise<string> {
    const exportPath = filepath || path.join(this.workDir, `results-${Date.now()}.json`);

    const results = {
      summary: {
        total: this.tasks.length,
        completed: this.tasks.filter(t => t.status === 'completed').length,
        failed: this.tasks.filter(t => t.status === 'failed').length,
        pending: this.tasks.filter(t => t.status === 'pending').length,
        iterations: this.iteration
      },
      tasks: this.tasks,
      timestamp: Date.now()
    };

    await fs.writeFile(exportPath, JSON.stringify(results, null, 2));
    return exportPath;
  }

  /**
   * Clear all tasks (useful for new session)
   */
  async clear(): Promise<void> {
    this.tasks = [];
    this.iteration = 0;
    this.taskHashes.clear();
    await this.save();

    if (this.verbose) {
      console.log('[Callback Loop] Cleared all tasks');
    }
  }
}

/**
 * Helper function to create a callback loop
 */
export function createCallbackLoop(
  config: Config,
  toolManager: ToolManager,
  modelManager: ModelManager,
  options?: CallbackLoopOptions
): CallbackLoop {
  return new CallbackLoop(config, toolManager, modelManager, options);
}
