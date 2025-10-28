/**
 * Callback Loop Tool
 * Allows agents to create long-running tasks with automatic Claude ↔ Ollama handoff
 */

import { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

// This will be injected at runtime
let callbackLoopInstance: any = null;

export function setCallbackLoop(loop: any) {
  callbackLoopInstance = loop;
}

// Schema for starting a callback loop
const startCallbackLoopSchema = z.object({
  initial_task: z.string().describe('Initial task description to start the callback loop'),
  max_iterations: z.number().optional().describe('Maximum iterations (default: 50)'),
  verbose: z.boolean().optional().describe('Enable verbose output')
});

async function startCallbackLoop(args: z.infer<typeof startCallbackLoopSchema>): Promise<string> {
  if (!callbackLoopInstance) {
    return 'Error: Callback loop system not initialized. Use /callback-init first.';
  }

  await callbackLoopInstance.clear();
  const result = await callbackLoopInstance.run(args.initial_task);
  return result;
}

// Schema for adding tasks to the loop
const addCallbackTaskSchema = z.object({
  description: z.string().describe('Task description'),
  priority: z.number().optional().describe('Task priority (higher = earlier execution)'),
  agent: z.enum(['claude', 'ollama']).optional().describe('Which agent should handle this task')
});

async function addCallbackTask(args: z.infer<typeof addCallbackTaskSchema>): Promise<string> {
  if (!callbackLoopInstance) {
    return 'Error: Callback loop system not initialized.';
  }

  const taskId = callbackLoopInstance.addTask(
    args.description,
    'execute',
    args.agent || 'ollama',
    args.priority || 5
  );

  return `Task added with ID: ${taskId}`;
}

// Schema for processing Claude's response
const processClaudeResponseSchema = z.object({
  response: z.string().describe('Claude\'s response to process for new tasks')
});

async function processClaudeResponse(args: z.infer<typeof processClaudeResponseSchema>): Promise<string> {
  if (!callbackLoopInstance) {
    return 'Error: Callback loop system not initialized.';
  }

  callbackLoopInstance.processClaudeResponse(args.response);
  return 'Claude response processed. New tasks may have been added to the queue.';
}

// Schema for getting results
const getCallbackResultsSchema = z.object({
  export_to_file: z.boolean().optional().describe('Export results to a file')
});

async function getCallbackResults(args: z.infer<typeof getCallbackResultsSchema>): Promise<string> {
  if (!callbackLoopInstance) {
    return 'Error: Callback loop system not initialized.';
  }

  if (args.export_to_file) {
    const filepath = await callbackLoopInstance.exportResults();
    return `Results exported to: ${filepath}`;
  }

  const results = callbackLoopInstance.getResults();
  const completed = results.filter((r: any) => r.status === 'completed');
  const failed = results.filter((r: any) => r.status === 'failed');
  const pending = results.filter((r: any) => r.status === 'pending');

  let summary = `Callback Loop Status:\n`;
  summary += `  Completed: ${completed.length}\n`;
  summary += `  Failed: ${failed.length}\n`;
  summary += `  Pending: ${pending.length}\n\n`;

  if (completed.length > 0) {
    summary += `Completed Tasks:\n`;
    completed.slice(0, 5).forEach((task: any) => {
      summary += `  - ${task.description.substring(0, 60)}...\n`;
      if (task.result) {
        summary += `    Result: ${task.result.substring(0, 100)}...\n`;
      }
    });
  }

  return summary;
}

// Tool definitions
export const callbackLoopTools: ToolDefinition[] = [
  {
    name: 'start_callback_loop',
    description: 'Start a callback loop for long-running tasks with automatic Claude ↔ Ollama handoff. Use this to prevent connection timeouts on complex tasks.',
    schema: startCallbackLoopSchema,
    executor: startCallbackLoop
  },
  {
    name: 'add_callback_task',
    description: 'Add a new task to the running callback loop queue',
    schema: addCallbackTaskSchema,
    executor: addCallbackTask
  },
  {
    name: 'process_claude_feedback',
    description: 'Process Claude\'s response and extract new tasks to add to the queue',
    schema: processClaudeResponseSchema,
    executor: processClaudeResponse
  },
  {
    name: 'get_callback_results',
    description: 'Get current status and results from the callback loop',
    schema: getCallbackResultsSchema,
    executor: getCallbackResults
  }
];
