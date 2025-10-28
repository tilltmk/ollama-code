/**
 * Sub-Agent Tool
 * Allows agents to delegate tasks to other agents
 */

import { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

// This will be injected at runtime
let orchestratorInstance: any = null;

export function setSubAgentOrchestrator(orchestrator: any) {
  orchestratorInstance = orchestrator;
}

// Schema
const subAgentSchema = z.object({
  tasks: z.array(z.object({
    description: z.string().describe('Task description for the sub-agent'),
    model: z.string().optional().describe('Specific model to use (e.g., "granite4:micro", "qwen3-coder:30b")'),
    priority: z.number().optional().describe('Task priority (higher = executed first)'),
  })).describe('List of tasks to delegate to sub-agents'),
  execution_mode: z.enum(['parallel', 'sequential', 'smart']).optional().describe('How to execute tasks: parallel (all at once), sequential (one by one), smart (auto-decide based on priority)'),
});

async function delegateToSubAgents(args: z.infer<typeof subAgentSchema>): Promise<string> {
  if (!orchestratorInstance) {
    throw new Error('Sub-agent orchestrator not initialized');
  }

  const mode = args.execution_mode || 'smart';
  const tasks = args.tasks.map((t, idx) => ({
    id: `subtask_${idx}`,
    description: t.description,
    model: t.model,
    priority: t.priority || 0,
  }));

  let results: any[];
  if (mode === 'parallel') {
    results = await orchestratorInstance.executeParallel(tasks, true);
  } else if (mode === 'sequential') {
    results = await orchestratorInstance.executeSequential(tasks, true);
  } else {
    results = await orchestratorInstance.executeSmart(tasks, true);
  }

  // Format results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  let summary = `Executed ${results.length} sub-agent tasks:\n`;
  summary += `✓ Successful: ${successful.length}\n`;
  summary += `✗ Failed: ${failed.length}\n\n`;

  if (successful.length > 0) {
    summary += 'Results:\n';
    for (const result of successful) {
      summary += `\n[Task ${result.id}] (${result.duration}ms)\n`;
      summary += result.result + '\n';
    }
  }

  if (failed.length > 0) {
    summary += '\nErrors:\n';
    for (const result of failed) {
      summary += `\n[Task ${result.id}] FAILED\n`;
      summary += result.error + '\n';
    }
  }

  return summary;
}

// Tool definition
export const subAgentTool: ToolDefinition = {
  name: 'delegate_to_subagents',
  description: 'Delegate complex tasks to specialized sub-agents (other AI models) for parallel or sequential execution. Use this when you need to split work across multiple specialized agents.',
  schema: subAgentSchema,
  executor: delegateToSubAgents,
};
