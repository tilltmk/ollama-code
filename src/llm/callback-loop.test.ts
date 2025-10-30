import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CallbackLoop, type CallbackTask } from './callback-loop.js';
import type { Config } from '../types/index.js';
import { ToolManager } from '../tools/tool-manager.js';
import { ModelManager } from './model-manager.js';
import fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Agent
vi.mock('./agent.js', () => ({
  Agent: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue('Mock agent response'),
  })),
}));

describe('CallbackLoop', () => {
  let callbackLoop: CallbackLoop;
  let mockConfig: Config;
  let mockToolManager: ToolManager;
  let mockModelManager: ModelManager;
  const testWorkDir = '/tmp/test-callback-loop';

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      ollamaUrl: 'http://localhost:11434',
      defaultModel: 'test-model',
      availableModels: [],
      temperature: 0.7,
      maxTokens: 1000,
    };

    mockToolManager = new ToolManager();

    mockModelManager = {
      selectModelForTask: vi.fn().mockReturnValue('qwen-coder'),
    } as any;

    callbackLoop = new CallbackLoop(mockConfig, mockToolManager, mockModelManager, {
      workDir: testWorkDir,
      maxIterations: 10,
      verbose: false,
      autoSave: false, // Disable auto-save for tests
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty task queue', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

      await callbackLoop.initialize();

      expect(fs.mkdir).toHaveBeenCalledWith(testWorkDir, { recursive: true });
      expect(callbackLoop.getResults()).toEqual([]);
    });

    it('should load existing tasks from file', async () => {
      const savedTasks: CallbackTask[] = [
        {
          id: 'task_1',
          type: 'execute',
          description: 'Saved task',
          priority: 5,
          status: 'pending',
          agent: 'ollama',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      (fs.readFile as any).mockResolvedValue(
        JSON.stringify({
          tasks: savedTasks,
          iteration: 2,
        })
      );

      await callbackLoop.initialize();

      const tasks = callbackLoop.getResults();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].description).toBe('Saved task');
    });

    it('should select model if not provided', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));

      await callbackLoop.initialize();

      expect(mockModelManager.selectModelForTask).toHaveBeenCalledWith('code');
    });
  });

  describe('task management', () => {
    beforeEach(async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));
      await callbackLoop.initialize();
    });

    it('should add task to queue', () => {
      const taskId = callbackLoop.addTask('Test task', 'execute', 'ollama', 5);

      expect(taskId).toBeDefined();
      expect(taskId).toMatch(/^task_/);

      const tasks = callbackLoop.getResults();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].description).toBe('Test task');
      expect(tasks[0].status).toBe('pending');
    });

    it('should add multiple tasks', () => {
      callbackLoop.addTask('Task 1');
      callbackLoop.addTask('Task 2');
      callbackLoop.addTask('Task 3');

      expect(callbackLoop.getResults()).toHaveLength(3);
    });

    it('should set default task parameters', () => {
      const taskId = callbackLoop.addTask('Default task');
      const tasks = callbackLoop.getResults();
      const task = tasks.find(t => t.id === taskId);

      expect(task?.type).toBe('execute');
      expect(task?.agent).toBe('ollama');
      expect(task?.priority).toBe(5);
    });

    it('should assign unique IDs to tasks', () => {
      const id1 = callbackLoop.addTask('Task 1');
      const id2 = callbackLoop.addTask('Task 2');

      expect(id1).not.toBe(id2);
    });
  });

  describe('task prioritization', () => {
    beforeEach(async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));
      await callbackLoop.initialize();
    });

    it('should prioritize higher priority tasks', async () => {
      // Add tasks in reverse priority order
      callbackLoop.addTask('Low priority', 'execute', 'ollama', 1);
      callbackLoop.addTask('High priority', 'execute', 'ollama', 10);
      callbackLoop.addTask('Medium priority', 'execute', 'ollama', 5);

      // Run a single iteration
      await callbackLoop.run();

      const tasks = callbackLoop.getResults();
      const completedTask = tasks.find(t => t.status === 'completed');

      // High priority task should be executed first
      expect(completedTask?.description).toBe('High priority');
    });

    it('should use creation time as tiebreaker for same priority', async () => {
      callbackLoop.addTask('First', 'execute', 'ollama', 5);
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
      callbackLoop.addTask('Second', 'execute', 'ollama', 5);

      await callbackLoop.run();

      const tasks = callbackLoop.getResults();
      const completedTask = tasks.find(t => t.status === 'completed');

      // First task should be executed (older timestamp)
      expect(completedTask?.description).toBe('First');
    });
  });

  describe('task execution', () => {
    beforeEach(async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));
      await callbackLoop.initialize();
    });

    it('should execute ollama tasks', async () => {
      callbackLoop.addTask('Test ollama task', 'execute', 'ollama', 5);

      await callbackLoop.run();

      const tasks = callbackLoop.getResults();
      const task = tasks[0];

      expect(task.status).toBe('completed');
      expect(task.result).toBeDefined();
    });

    it('should create review task after execution', async () => {
      callbackLoop.addTask('Execute task', 'execute', 'ollama', 5);

      await callbackLoop.run();

      const tasks = callbackLoop.getResults();

      // Should have original task + review task
      expect(tasks.length).toBeGreaterThan(1);

      const reviewTask = tasks.find(t => t.type === 'review');
      expect(reviewTask).toBeDefined();
      expect(reviewTask?.agent).toBe('claude');
    });

    it('should handle claude tasks', async () => {
      callbackLoop.addTask('Claude task', 'execute', 'claude', 5);

      await callbackLoop.run();

      const tasks = callbackLoop.getResults();
      const claudeTask = tasks[0];

      expect(claudeTask.status).toBe('completed');
      expect(claudeTask.result).toContain('Awaiting Claude response');
    });

    it('should mark failed tasks', async () => {
      const { Agent } = await import('./agent.js');
      (Agent as any).mockImplementation(() => ({
        run: vi.fn().mockRejectedValue(new Error('Execution failed')),
      }));

      callbackLoop.addTask('Failing task', 'execute', 'ollama', 5);

      await callbackLoop.run();

      const tasks = callbackLoop.getResults();
      const failedTask = tasks[0];

      expect(failedTask.status).toBe('failed');
      expect(failedTask.error).toBe('Execution failed');
    });

    it('should create retry task for failed tasks', async () => {
      const { Agent } = await import('./agent.js');
      (Agent as any).mockImplementation(() => ({
        run: vi.fn().mockRejectedValue(new Error('Execution failed')),
      }));

      callbackLoop.addTask('Failing task', 'execute', 'ollama', 5);

      await callbackLoop.run();

      const tasks = callbackLoop.getResults();

      // Should have original failed task + retry task
      const retryTask = tasks.find(t => t.description.includes('Retry'));
      expect(retryTask).toBeDefined();
      expect(retryTask?.priority).toBe(4); // Lower priority
    });

    it('should not create retry task if priority is 1', async () => {
      const { Agent } = await import('./agent.js');
      (Agent as any).mockImplementation(() => ({
        run: vi.fn().mockRejectedValue(new Error('Execution failed')),
      }));

      callbackLoop.addTask('Failing task', 'execute', 'ollama', 1);

      await callbackLoop.run();

      const tasks = callbackLoop.getResults();

      // Should only have the failed task, no retry
      expect(tasks).toHaveLength(1);
    });
  });

  describe('Claude response processing', () => {
    beforeEach(async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));
      await callbackLoop.initialize();
    });

    it('should extract structured tasks from Claude response', () => {
      const claudeResponse = `
        Based on the review, here are the next steps:
        TASK[10]: Implement user authentication
        TASK[8]: Add error handling
        TASK[5]: Write unit tests
      `;

      callbackLoop.processClaudeResponse(claudeResponse);

      const tasks = callbackLoop.getResults();
      expect(tasks).toHaveLength(3);

      expect(tasks[0].description).toBe('Implement user authentication');
      expect(tasks[0].priority).toBe(10);

      expect(tasks[1].description).toBe('Add error handling');
      expect(tasks[1].priority).toBe(8);
    });

    it('should detect completion signal', () => {
      const responseWithDone = 'Everything looks good. DONE.';

      callbackLoop.processClaudeResponse(responseWithDone);

      // Should not add any new tasks
      expect(callbackLoop.getResults()).toHaveLength(0);
    });

    it('should create general task for unstructured response', () => {
      const unstructuredResponse = 'Please implement the login feature with proper validation';

      callbackLoop.processClaudeResponse(unstructuredResponse);

      const tasks = callbackLoop.getResults();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].description).toBe(unstructuredResponse);
      expect(tasks[0].priority).toBe(5);
    });

    it('should ignore very short responses', () => {
      callbackLoop.processClaudeResponse('Ok');

      expect(callbackLoop.getResults()).toHaveLength(0);
    });
  });

  describe('loop execution', () => {
    beforeEach(async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));
      await callbackLoop.initialize();
    });

    it('should stop when all tasks completed', async () => {
      callbackLoop.addTask('Single task', 'execute', 'ollama', 5);

      const summary = await callbackLoop.run();

      expect(summary).toContain('All tasks completed');
      expect(summary).toContain('Tasks completed: 1');
    });

    it('should stop at max iterations', async () => {
      const loop = new CallbackLoop(mockConfig, mockToolManager, mockModelManager, {
        workDir: testWorkDir,
        maxIterations: 2,
        autoSave: false,
      });

      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));
      await loop.initialize();

      // Add tasks that create more tasks (infinite loop scenario)
      loop.addTask('Task 1', 'execute', 'ollama', 5);

      const summary = await loop.run();

      // Should stop after max iterations
      expect(summary).toContain('Total iterations: 2');
    });

    it('should throw if no tasks provided', async () => {
      await expect(callbackLoop.run()).rejects.toThrow('No tasks to execute');
    });

    it('should pause when Claude task completes', async () => {
      callbackLoop.addTask('Review task', 'review', 'claude', 5);

      const summary = await callbackLoop.run();

      expect(summary).toContain('Paused');
      expect(summary).toContain('Awaiting Claude response');
    });

    it('should continue after processing Claude response', async () => {
      callbackLoop.addTask('Claude task', 'execute', 'claude', 5);

      await callbackLoop.run(); // First run - pauses at Claude task

      callbackLoop.processClaudeResponse('TASK[5]: New ollama task');

      await callbackLoop.run(); // Second run - executes new task

      const tasks = callbackLoop.getResults();
      const completedTasks = tasks.filter(t => t.status === 'completed');

      expect(completedTasks.length).toBeGreaterThan(1);
    });
  });

  describe('state management', () => {
    beforeEach(async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));
      await callbackLoop.initialize();
    });

    it('should get all task results', () => {
      callbackLoop.addTask('Task 1');
      callbackLoop.addTask('Task 2');

      const results = callbackLoop.getResults();
      expect(results).toHaveLength(2);
    });

    it('should export results to file', async () => {
      callbackLoop.addTask('Task 1', 'execute', 'ollama', 5);
      await callbackLoop.run();

      const exportPath = await callbackLoop.exportResults();

      expect(fs.writeFile).toHaveBeenCalled();
      expect(exportPath).toContain('results-');
    });

    it('should include summary in export', async () => {
      callbackLoop.addTask('Completed task', 'execute', 'ollama', 5);
      await callbackLoop.run();

      await callbackLoop.exportResults();

      const writeCall = (fs.writeFile as any).mock.calls[0];
      const exportData = JSON.parse(writeCall[1]);

      expect(exportData.summary).toBeDefined();
      expect(exportData.summary.total).toBe(2); // Original + review task
      expect(exportData.summary.completed).toBeGreaterThan(0);
    });

    it('should clear all tasks', async () => {
      callbackLoop.addTask('Task 1');
      callbackLoop.addTask('Task 2');

      await callbackLoop.clear();

      expect(callbackLoop.getResults()).toEqual([]);
    });

    it('should update task timestamps', async () => {
      callbackLoop.addTask('Test task', 'execute', 'ollama', 5);

      const tasksBefore = callbackLoop.getResults();
      const createdAt = tasksBefore[0].createdAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      await callbackLoop.run();

      const tasksAfter = callbackLoop.getResults();
      const updatedAt = tasksAfter[0].updatedAt;

      expect(updatedAt).toBeGreaterThan(createdAt);
    });
  });

  describe('auto-save functionality', () => {
    it('should save state when autoSave is enabled', async () => {
      const loop = new CallbackLoop(mockConfig, mockToolManager, mockModelManager, {
        workDir: testWorkDir,
        autoSave: true,
      });

      (fs.readFile as any).mockRejectedValue(new Error('ENOENT'));
      await loop.initialize();

      loop.addTask('Task with autosave');
      await loop.run();

      // Should have saved multiple times during execution
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should not save when autoSave is disabled', async () => {
      callbackLoop.addTask('Task without autosave');
      await callbackLoop.run();

      // Should not have saved automatically
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
