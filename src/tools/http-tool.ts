/**
 * HTTP Tool
 * Allows agents to make HTTP requests
 */

import { z } from 'zod';
import fetch from 'node-fetch';
import type { ToolDefinition } from '../types/index.js';
import { HTTP } from '../constants/index.js';

// Schema for HTTP requests
const httpRequestSchema = z.object({
  url: z.string().url().describe('URL to request'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']).optional().describe('HTTP method (default: GET)'),
  headers: z.record(z.string()).optional().describe('HTTP headers as key-value pairs'),
  body: z.string().optional().describe('Request body (JSON string for POST/PUT/PATCH)'),
  timeout: z.number().optional().describe(`Request timeout in milliseconds (default: ${HTTP.DEFAULT_TIMEOUT})`)
});

async function makeHttpRequest(args: z.infer<typeof httpRequestSchema>): Promise<string> {
  try {
    const method = args.method || 'GET';
    const timeout = args.timeout || HTTP.DEFAULT_TIMEOUT;

    const options: any = {
      method,
      headers: args.headers || {},
      timeout
    };

    // Add body for POST/PUT/PATCH
    if (args.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      options.body = args.body;

      // Set Content-Type if not provided
      if (!options.headers['Content-Type'] && !options.headers['content-type']) {
        options.headers['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(args.url, options);

    // Get response body
    const contentType = response.headers.get('content-type') || '';
    let body: any;

    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    // Build result
    const result = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: body
    };

    return JSON.stringify(result, null, 2);

  } catch (error) {
    return `HTTP Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Schema for downloading files
const downloadFileSchema = z.object({
  url: z.string().url().describe('URL of the file to download'),
  output_path: z.string().describe('Local path where to save the file'),
  timeout: z.number().optional().describe('Download timeout in milliseconds (default: 60000)')
});

async function downloadFile(args: z.infer<typeof downloadFileSchema>): Promise<string> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const timeout = args.timeout || 60000;

    const response = await fetch(args.url, { timeout });

    if (!response.ok) {
      return `Download failed: ${response.status} ${response.statusText}`;
    }

    // Ensure directory exists
    const dir = path.dirname(args.output_path);
    await fs.promises.mkdir(dir, { recursive: true });

    // Download file
    const buffer = await response.buffer();
    await fs.promises.writeFile(args.output_path, buffer);

    return `File downloaded successfully to: ${args.output_path} (${buffer.length} bytes)`;

  } catch (error) {
    return `Download Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Tool definitions
export const httpTools: ToolDefinition[] = [
  {
    name: 'http_request',
    description: 'Make HTTP requests to APIs or websites. Supports GET, POST, PUT, DELETE, PATCH methods.',
    schema: httpRequestSchema,
    executor: makeHttpRequest
  },
  {
    name: 'download_file',
    description: 'Download a file from a URL and save it locally',
    schema: downloadFileSchema,
    executor: downloadFile
  }
];
