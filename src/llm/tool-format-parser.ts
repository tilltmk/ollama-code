/**
 * Tool Format Parser
 * Handles different tool calling formats from various models
 */

import type { ToolCall, Message } from '../types/index.js';

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, any>;
}

export class ToolFormatParser {
  // Cache for known tools to avoid repeated lookups
  private static knownToolsSet: Set<string> = new Set();

  /**
   * Initialize the parser with known tools
   * This enables strict validation and reduces false positives
   */
  static setKnownTools(tools: string[]): void {
    this.knownToolsSet = new Set(tools);
  }

  /**
   * Check if a function name is a known tool
   */
  private static isKnownTool(name: string): boolean {
    return this.knownToolsSet.has(name);
  }

  /**
   * Parse XML-style tool calls (used by Qwen and similar models)
   * Example: <function=write_file><parameter=file_path>test.txt</parameter>...
   */
  private static parseXMLToolCall(text: string, knownTools?: string[]): ParsedToolCall | null {
    // Match pattern: <function=NAME>...</function> with stricter validation
    const functionMatch = text.match(/<function[=\s]+([a-zA-Z_]\w*)\s*>/);
    if (!functionMatch) return null;

    const functionName = functionMatch[1].trim();

    // Validate against known tools if provided
    if (knownTools && !knownTools.includes(functionName)) {
      return null;
    }
    if (this.knownToolsSet.size > 0 && !this.isKnownTool(functionName)) {
      return null;
    }

    const args: Record<string, any> = {};

    // Extract parameters - try all known formats
    const paramRegex = /<parameter[=\s]+([a-zA-Z_]\w*)>\s*([\s\S]*?)\s*<\/parameter>/g;
    let paramMatch;

    while ((paramMatch = paramRegex.exec(text)) !== null) {
      const paramName = paramMatch[1].trim();
      const paramValue = paramMatch[2].trim();
      if (paramValue) {
        args[paramName] = paramValue;
      }
    }

    // Alternative format: <parameter=name>value</parameter>
    if (Object.keys(args).length === 0) {
      const altParamRegex = /<parameter=([a-zA-Z_]\w*)>([^<]*)<\/parameter>/g;
      while ((paramMatch = altParamRegex.exec(text)) !== null) {
        const paramName = paramMatch[1].trim();
        const paramValue = paramMatch[2].trim();
        if (paramValue) {
          args[paramName] = paramValue;
        }
      }
    }

    // Try simpler format: <parameter=name>value</parameter> without closing tag
    if (Object.keys(args).length === 0) {
      const simpleParamRegex = /<parameter=([a-zA-Z_]\w*)>\n([^<]*)/g;
      while ((paramMatch = simpleParamRegex.exec(text)) !== null) {
        const paramName = paramMatch[1].trim();
        const paramValue = paramMatch[2].trim();
        if (paramValue) {
          args[paramName] = paramValue;
        }
      }
    }

    return {
      name: functionName,
      arguments: args
    };
  }

  /**
   * Parse Python-style function calls with strict validation
   * Example: write_file(file_path="test.txt", content="Hello")
   * Only matches known tools to reduce false positives
   */
  private static parsePythonToolCall(text: string, knownTools?: string[]): ParsedToolCall | null {
    // More strict pattern - only match identifiers that are known tools
    const toolsToCheck = knownTools || Array.from(this.knownToolsSet);

    for (const toolName of toolsToCheck) {
      // Escape underscores and special chars for regex
      const escapedName = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `\\b${escapedName}\\s*\\(\\s*([^)]*)\\s*\\)`,
        'g'
      );

      const match = pattern.exec(text);
      if (match) {
        const argsString = match[1];
        const args: Record<string, any> = {};

        // Parse keyword arguments more carefully
        const argRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{[^}]*\})|(\[[^\]]*\])|([^,)]+))/g;
        let argMatch;

        while ((argMatch = argRegex.exec(argsString)) !== null) {
          const key = argMatch[1];
          const value = argMatch[2] || argMatch[3] || argMatch[4] || argMatch[5] || argMatch[6];
          if (value) {
            args[key] = value.trim();
          }
        }

        return {
          name: toolName,
          arguments: args
        };
      }
    }

    return null;
  }

  /**
   * Parse tool call from any format with strict validation
   */
  private static parseToolCall(text: string, knownTools?: string[]): ParsedToolCall | null {
    // Try XML format first (most reliable)
    const xmlParsed = this.parseXMLToolCall(text, knownTools);
    if (xmlParsed && xmlParsed.name) {
      return xmlParsed;
    }

    // Try Python-style with validation
    const pythonParsed = this.parsePythonToolCall(text, knownTools);
    if (pythonParsed && pythonParsed.name) {
      return pythonParsed;
    }

    return null;
  }

  /**
   * Extract tool calls from assistant message content
   * Handles cases where models output tool calls in text instead of structured format
   * Only extracts calls for known tools
   */
  static extractToolCallsFromText(message: Message, knownTools: string[]): ToolCall[] {
    if (!message.content) return [];

    const toolCalls: ToolCall[] = [];

    // Look for XML-style function calls first (most reliable)
    const xmlPattern = /<function[=\s]+[a-zA-Z_]\w*\s*>[\s\S]*?<\/function>/g;
    const xmlMatches = message.content.match(xmlPattern);

    if (xmlMatches) {
      for (const match of xmlMatches) {
        const parsed = this.parseToolCall(match, knownTools);
        if (parsed) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: parsed.name,
              arguments: JSON.stringify(parsed.arguments)
            }
          });
        }
      }
    }

    // Look for Python-style function calls only if XML didn't match
    // This prevents false positives from normal function calls
    if (toolCalls.length === 0) {
      for (const toolName of knownTools) {
        const escapedName = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pythonPattern = new RegExp(
          `\\b${escapedName}\\s*\\(\\s*[^)]*\\s*\\)`,
          'g'
        );
        const pythonMatches = message.content.match(pythonPattern);

        if (pythonMatches) {
          for (const match of pythonMatches) {
            const parsed = this.parseToolCall(match, knownTools);
            if (parsed && !toolCalls.some(c => c.function.name === parsed.name)) {
              toolCalls.push({
                id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'function',
                function: {
                  name: parsed.name,
                  arguments: JSON.stringify(parsed.arguments)
                }
              });
            }
          }
        }
      }
    }

    return toolCalls;
  }

  /**
   * Convert text-based tool calls to structured format
   */
  static normalizeMessage(message: Message, knownTools: string[]): Message {
    // If already has tool_calls, return as is
    if (message.tool_calls && message.tool_calls.length > 0) {
      return message;
    }

    // Initialize known tools for this call
    this.setKnownTools(knownTools);

    // Try to extract tool calls from content
    const extracted = this.extractToolCallsFromText(message, knownTools);

    // Filter to only known tools (double validation)
    const validCalls = extracted.filter(call =>
      knownTools.includes(call.function.name)
    );

    if (validCalls.length > 0) {
      return {
        ...message,
        tool_calls: validCalls
      };
    }

    return message;
  }
}
