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
  /**
   * Parse XML-style tool calls (used by Qwen and similar models)
   * Example: <function=write_file><parameter=file_path>test.txt</parameter>...
   */
  private static parseXMLToolCall(text: string): ParsedToolCall | null {
    // Match pattern: <function=NAME>...</function>
    const functionMatch = text.match(/<function[=\s]+([^>]+)>/);
    if (!functionMatch) return null;

    const functionName = functionMatch[1].trim();
    const args: Record<string, any> = {};

    // Extract parameters
    const paramRegex = /<parameter[=\s]+([^>]+)>([^<]*)<\/parameter>/g;
    let paramMatch;

    while ((paramMatch = paramRegex.exec(text)) !== null) {
      const paramName = paramMatch[1].trim();
      const paramValue = paramMatch[2].trim();
      args[paramName] = paramValue;
    }

    // Alternative format: <parameter=name>value</parameter>
    const altParamRegex = /<parameter=([^>]+)>([^<]*)<\/parameter>/g;
    while ((paramMatch = altParamRegex.exec(text)) !== null) {
      const paramName = paramMatch[1].trim();
      const paramValue = paramMatch[2].trim();
      args[paramName] = paramValue;
    }

    if (Object.keys(args).length === 0) {
      // Try simpler format: <parameter=name>value</parameter> without closing tag
      const simpleParamRegex = /<parameter=([^>]+)>\n([^<]*)/g;
      while ((paramMatch = simpleParamRegex.exec(text)) !== null) {
        const paramName = paramMatch[1].trim();
        const paramValue = paramMatch[2].trim();
        args[paramName] = paramValue;
      }
    }

    return {
      name: functionName,
      arguments: args
    };
  }

  /**
   * Parse Python-style function calls
   * Example: write_file(file_path="test.txt", content="Hello")
   */
  private static parsePythonToolCall(text: string): ParsedToolCall | null {
    const match = text.match(/(\w+)\s*\(\s*([^)]*)\s*\)/);
    if (!match) return null;

    const functionName = match[1];
    const argsString = match[2];

    const args: Record<string, any> = {};

    // Parse keyword arguments
    const argRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let argMatch;

    while ((argMatch = argRegex.exec(argsString)) !== null) {
      const key = argMatch[1];
      const value = argMatch[2] || argMatch[3] || argMatch[4];
      args[key] = value;
    }

    return {
      name: functionName,
      arguments: args
    };
  }

  /**
   * Parse tool call from  any format
   */
  static parseToolCall(text: string): ParsedToolCall | null {
    // Try XML format first (most common alternative)
    const xmlParsed = this.parseXMLToolCall(text);
    if (xmlParsed && xmlParsed.name) {
      return xmlParsed;
    }

    // Try Python-style
    const pythonParsed = this.parsePythonToolCall(text);
    if (pythonParsed && pythonParsed.name) {
      return pythonParsed;
    }

    return null;
  }

  /**
   * Extract tool calls from assistant message content
   * Handles cases where models output tool calls in text instead of structured format
   */
  static extractToolCallsFromText(message: Message): ToolCall[] {
    if (!message.content) return [];

    const toolCalls: ToolCall[] = [];

    // Look for XML-style function calls
    const xmlPattern = /<function[=\s]+[^>]+>[\s\S]*?<\/function>/g;
    const xmlMatches = message.content.match(xmlPattern);

    if (xmlMatches) {
      for (const match of xmlMatches) {
        const parsed = this.parseToolCall(match);
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

    // Look for Python-style function calls
    const pythonPattern = /\b(\w+)\s*\(\s*[^)]*\s*\)/g;
    const pythonMatches = message.content.match(pythonPattern);

    if (pythonMatches && toolCalls.length === 0) { // Only if XML didn't match
      for (const match of pythonMatches) {
        const parsed = this.parseToolCall(match);
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

    // Try to extract tool calls from content
    const extracted = this.extractToolCallsFromText(message);

    // Filter to only known tools
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
