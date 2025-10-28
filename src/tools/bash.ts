import { execa } from 'execa';
import { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

// Schema
const bashSchema = z.object({
  command: z.string().describe('The bash command to execute'),
  timeout: z.number().optional().describe('Timeout in milliseconds (max 600000, default 120000)'),
  description: z.string().optional().describe('Short description of what the command does'),
});

async function executeBash(args: z.infer<typeof bashSchema>): Promise<string> {
  try {
    const timeout = Math.min(args.timeout || 120000, 600000);

    const result = await execa('bash', ['-c', args.command], {
      timeout,
      reject: false, // Don't throw on non-zero exit codes
      cwd: process.cwd(),
      shell: false,
      env: {
        ...process.env,
        // Ensure proper environment
      },
    });

    // Combine stdout and stderr
    let output = '';
    if (result.stdout) {
      output += result.stdout;
    }
    if (result.stderr) {
      if (output) output += '\n';
      output += `[stderr]\n${result.stderr}`;
    }

    // Add exit code if non-zero
    if (result.exitCode !== 0) {
      if (output) output += '\n';
      output += `[exit code: ${result.exitCode}]`;
    }

    // Handle timeout
    if (result.timedOut) {
      output += '\n[command timed out]';
    }

    return output || '[no output]';
  } catch (error) {
    if ((error as any).timedOut) {
      return `Command timed out after ${args.timeout || 120000}ms`;
    }
    throw new Error(`Failed to execute command: ${error}`);
  }
}

// Tool definition
export const bashTool: ToolDefinition = {
  name: 'bash',
  description: 'Execute a bash command in the shell and return the output',
  schema: bashSchema,
  executor: executeBash,
};
