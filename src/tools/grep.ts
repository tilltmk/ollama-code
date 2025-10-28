import { execa } from 'execa';
import { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

// Schema
const grepSchema = z.object({
  pattern: z.string().describe('The regular expression pattern to search for'),
  path: z.string().optional().describe('File or directory to search in (defaults to current directory)'),
  type: z.string().optional().describe('File type filter (e.g., "js", "py", "ts")'),
  glob: z.string().optional().describe('Glob pattern to filter files (e.g., "*.js", "**/*.tsx")'),
  output_mode: z.enum(['content', 'files_with_matches', 'count']).optional().describe('Output mode: content (show matching lines), files_with_matches (show file paths), count (show match counts)'),
  case_insensitive: z.boolean().optional().describe('Case insensitive search'),
  context_before: z.number().optional().describe('Number of lines to show before each match'),
  context_after: z.number().optional().describe('Number of lines to show after each match'),
  context: z.number().optional().describe('Number of lines to show before and after each match'),
  line_numbers: z.boolean().optional().describe('Show line numbers in output'),
  head_limit: z.number().optional().describe('Limit output to first N entries'),
});

async function grepSearch(args: z.infer<typeof grepSchema>): Promise<string> {
  try {
    const rgArgs: string[] = [];

    // Pattern
    rgArgs.push(args.pattern);

    // Path
    if (args.path) {
      rgArgs.push(args.path);
    }

    // Output mode
    const outputMode = args.output_mode || 'files_with_matches';
    if (outputMode === 'files_with_matches') {
      rgArgs.push('--files-with-matches');
    } else if (outputMode === 'count') {
      rgArgs.push('--count');
    }
    // 'content' is default mode, no flag needed

    // File type
    if (args.type) {
      rgArgs.push('--type', args.type);
    }

    // Glob pattern
    if (args.glob) {
      rgArgs.push('--glob', args.glob);
    }

    // Case insensitive
    if (args.case_insensitive) {
      rgArgs.push('-i');
    }

    // Context
    if (args.context !== undefined) {
      rgArgs.push('-C', String(args.context));
    } else {
      if (args.context_before !== undefined) {
        rgArgs.push('-B', String(args.context_before));
      }
      if (args.context_after !== undefined) {
        rgArgs.push('-A', String(args.context_after));
      }
    }

    // Line numbers
    if (args.line_numbers && outputMode === 'content') {
      rgArgs.push('-n');
    }

    // Additional flags for better output
    rgArgs.push('--color=never'); // No color in output
    rgArgs.push('--no-heading'); // No file headers

    // Execute ripgrep
    const result = await execa('rg', rgArgs, {
      reject: false, // Don't throw on non-zero exit
      cwd: process.cwd(),
    });

    let output = result.stdout;

    // Handle no matches
    if (result.exitCode === 1) {
      return `No matches found for pattern: ${args.pattern}`;
    }

    // Handle errors
    if (result.exitCode !== undefined && result.exitCode > 1) {
      throw new Error(`ripgrep error: ${result.stderr || 'Unknown error'}`);
    }

    // Apply head limit if specified
    if (args.head_limit && output) {
      const lines = output.split('\n');
      output = lines.slice(0, args.head_limit).join('\n');
      if (lines.length > args.head_limit) {
        output += `\n... (${lines.length - args.head_limit} more lines omitted)`;
      }
    }

    return output || 'No results';
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new Error('ripgrep (rg) is not installed. Please install it: https://github.com/BurntSushi/ripgrep');
    }
    throw new Error(`Failed to execute grep: ${error}`);
  }
}

// Tool definition
export const grepTool: ToolDefinition = {
  name: 'grep',
  description: 'Search for patterns in files using ripgrep (fast regex search)',
  schema: grepSchema,
  executor: grepSearch,
};
