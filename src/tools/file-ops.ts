import { promises as fs } from 'fs';
import { dirname } from 'path';
import { glob } from 'glob';
import { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

// Schemas
const readFileSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to read'),
  offset: z.number().optional().describe('Line number to start reading from'),
  limit: z.number().optional().describe('Number of lines to read'),
});

const writeFileSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to write'),
  content: z.string().describe('Content to write to the file'),
});

const editFileSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to modify'),
  old_string: z.string().describe('The text to replace'),
  new_string: z.string().describe('The text to replace it with'),
  replace_all: z.boolean().optional().describe('Replace all occurrences (default false)'),
});

const globSchema = z.object({
  pattern: z.string().describe('The glob pattern to match files against'),
  path: z.string().optional().describe('The directory to search in (defaults to cwd)'),
});

// Tool executors
async function readFile(args: z.infer<typeof readFileSchema>): Promise<string> {
  try {
    const content = await fs.readFile(args.file_path, 'utf-8');
    const lines = content.split('\n');

    // Apply offset and limit if provided
    const startLine = args.offset || 0;
    const endLine = args.limit ? startLine + args.limit : lines.length;
    const selectedLines = lines.slice(startLine, endLine);

    // Format with line numbers (cat -n style)
    return selectedLines
      .map((line, index) => `${startLine + index + 1}→${line}`)
      .join('\n');
  } catch (error) {
    throw new Error(`Failed to read file ${args.file_path}: ${error}`);
  }
}

async function writeFile(args: z.infer<typeof writeFileSchema>): Promise<string> {
  try {
    // Ensure directory exists
    const dir = dirname(args.file_path);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(args.file_path, args.content, 'utf-8');
    return `File written successfully: ${args.file_path}`;
  } catch (error) {
    throw new Error(`Failed to write file ${args.file_path}: ${error}`);
  }
}

async function editFile(args: z.infer<typeof editFileSchema>): Promise<string> {
  try {
    // Read the file
    const content = await fs.readFile(args.file_path, 'utf-8');

    // Replace the content
    let newContent: string;
    if (args.replace_all) {
      // Replace all occurrences
      newContent = content.split(args.old_string).join(args.new_string);
    } else {
      // Replace only the first occurrence
      const index = content.indexOf(args.old_string);
      if (index === -1) {
        throw new Error(`String not found in file: ${args.old_string}`);
      }
      newContent = content.substring(0, index) +
        args.new_string +
        content.substring(index + args.old_string.length);
    }

    // Check if multiple occurrences exist when replace_all is false
    if (!args.replace_all) {
      const count = (content.match(new RegExp(args.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (count > 1) {
        throw new Error(`Found ${count} occurrences. Use replace_all: true to replace all.`);
      }
    }

    // Write back
    await fs.writeFile(args.file_path, newContent, 'utf-8');
    return `File edited successfully: ${args.file_path}`;
  } catch (error) {
    throw new Error(`Failed to edit file ${args.file_path}: ${error}`);
  }
}

async function globFiles(args: z.infer<typeof globSchema>): Promise<string> {
  try {
    const cwd = args.path || process.cwd();
    const files = await glob(args.pattern, {
      cwd,
      absolute: true,
      nodir: true,
    });

    if (files.length === 0) {
      return `No files found matching pattern: ${args.pattern}`;
    }

    return files.join('\n');
  } catch (error) {
    throw new Error(`Failed to glob files: ${error}`);
  }
}

// Tool definitions
export const fileTools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem',
    schema: readFileSchema,
    executor: readFile,
  },
  {
    name: 'write_file',
    description: 'Write content to a file, creating it if it doesn\'t exist',
    schema: writeFileSchema,
    executor: writeFile,
  },
  {
    name: 'edit_file',
    description: 'Edit a file by replacing text (exact string replacement)',
    schema: editFileSchema,
    executor: editFile,
  },
  {
    name: 'glob',
    description: 'Find files matching a glob pattern',
    schema: globSchema,
    executor: globFiles,
  },
];
