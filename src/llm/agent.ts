import { OllamaClient } from './ollama-client.js';
import { ModelManager } from './model-manager.js';
import { ToolManager } from '../tools/tool-manager.js';
import { ToolFormatParser } from './tool-format-parser.js';
import type { Message, Config } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/errors.js';
import { DEFAULTS, REGEX_PATTERNS } from '../constants/index.js';

export interface AgentConfig {
  systemPrompt?: string;
  model?: string;
  maxIterations?: number;
  verbose?: boolean;
  maxRetries?: number; // Max retries for failed tool calls
}

function extractThinking(content: string): { thinking: string | undefined; cleanContent: string } {
  const match = content.match(REGEX_PATTERNS.THINKING);
  if (match) {
    return {
      thinking: match[1].trim(),
      cleanContent: content.replace(REGEX_PATTERNS.THINKING, '').trim()
    };
  }
  return { thinking: undefined, cleanContent: content };
}

export class Agent {
  private client: OllamaClient;
  private modelManager: ModelManager;
  private toolManager: ToolManager;
  private config: Config;
  private conversationHistory: Message[] = [];
  private readonly MAX_HISTORY_SIZE = DEFAULTS.AGENT.MAX_HISTORY_SIZE;

  constructor(
    config: Config,
    toolManager: ToolManager,
    modelManager: ModelManager
  ) {
    this.config = config;
    this.client = new OllamaClient(config.ollamaUrl);
    this.modelManager = modelManager;
    this.toolManager = toolManager;
  }

  /**
   * Set the system prompt
   */
  setSystemPrompt(prompt: string): void {
    // Remove existing system message if any
    this.conversationHistory = this.conversationHistory.filter(msg => msg.role !== 'system');
    // Add new system message at the start
    this.conversationHistory.unshift({
      role: 'system',
      content: prompt,
    });
  }

  /**
   * Add a user message to the conversation
   */
  addUserMessage(content: string): void {
    this.conversationHistory.push({
      role: 'user',
      content,
    });
  }

  /**
   * Get the conversation history
   */
  getHistory(): Message[] {
    return this.conversationHistory;
  }

  /**
   * Get the last thinking/reasoning from the last assistant message
   */
  getLastThinking(): string | undefined {
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      const msg = this.conversationHistory[i];
      if (msg.role === 'assistant' && msg.thinking) {
        return msg.thinking;
      }
    }
    return undefined;
  }

  /**
   * Clear conversation history (keeps system prompt if set)
   */
  clearHistory(): void {
    const systemMsg = this.conversationHistory.find(msg => msg.role === 'system');
    this.conversationHistory = systemMsg ? [systemMsg] : [];
  }

  /**
   * Compress conversation history to prevent memory overflow
   * Keeps system message and most recent messages
   */
  private compressHistory(): void {
    if (this.conversationHistory.length > this.MAX_HISTORY_SIZE) {
      const systemMsg = this.conversationHistory.find(m => m.role === 'system');
      const recentMessages = this.conversationHistory.slice(-30);
      this.conversationHistory = systemMsg ? [systemMsg, ...recentMessages] : recentMessages;
    }
  }

  /**
   * Run the agent with a user message
   */
  async run(userMessage: string, agentConfig: AgentConfig = {}): Promise<string> {
    const maxIterations = agentConfig.maxIterations || 50; // Increased from 10 to 50
    const maxRetries = agentConfig.maxRetries || 3;
    // Use model from agentConfig, then config.defaultModel, then select based on task
    const model = agentConfig.model ||
                   this.config.defaultModel ||
                   this.modelManager.selectModelForTask('code');
    const verbose = agentConfig.verbose || false;

    // Set system prompt if provided
    if (agentConfig.systemPrompt) {
      this.setSystemPrompt(agentConfig.systemPrompt);
    }

    // Add user message
    this.addUserMessage(userMessage);

    let iterations = 0;
    let finalResponse = '';

    while (iterations < maxIterations) {
      iterations++;

      // Compress history if needed to prevent memory overflow
      this.compressHistory();

      if (verbose) {
        console.log(`\n[Iteration ${iterations}]`);
      }

      // Make API call with tools (with retry logic)
      let response;
      let retryCount = 0;
      let lastError: Error | undefined;

      while (retryCount < maxRetries) {
        try {
          logger.api(`/chat/completions`, 'POST', 'request', { model, iteration: iterations, retry: retryCount });
          response = await this.client.chatCompletion({
            model,
            messages: this.conversationHistory,
            tools: this.toolManager.getToolsForOllama(),
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
          });
          logger.api(`/chat/completions`, 'POST', 'success', { model, iteration: iterations });
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          retryCount++;

          const backoffTime = 1000 * retryCount;
          logger.warn(`API call failed, retry ${retryCount}/${maxRetries}`, {
            error: lastError.message,
            backoffMs: backoffTime,
            iteration: iterations
          });

          if (retryCount >= maxRetries) {
            const apiError = new ApiError(
              `Failed to get response after ${maxRetries} retries: ${lastError.message}`,
              503,
              { originalError: lastError.message, retries: maxRetries }
            );
            logger.error('Max retries reached for API call', apiError, { model, iteration: iterations });
            throw apiError;
          }

          if (verbose) {
            console.log(`[Retry ${retryCount}/${maxRetries}] API call failed: ${lastError.message}. Retrying in ${backoffTime}ms...`);
          }

          await new Promise(resolve => setTimeout(resolve, backoffTime)); // Exponential backoff
        }
      }

      if (!response) {
        const apiError = new ApiError('Failed to get response after retries', 500);
        logger.error('No response received after retries', apiError);
        throw apiError;
      }

      // Validate response structure
      if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
        const apiError = new ApiError('Invalid API response: missing or empty choices array', 500);
        logger.error('Invalid API response structure', apiError, { response });
        throw apiError;
      }

      if (!response.choices[0].message) {
        const apiError = new ApiError('Invalid API response: missing message in first choice', 500);
        logger.error('Invalid API response structure', apiError, { response });
        throw apiError;
      }

      let assistantMessage = response.choices[0].message;

      // Extract thinking/reasoning from content
      if (assistantMessage.content) {
        const { thinking, cleanContent } = extractThinking(assistantMessage.content);
        if (thinking) {
          assistantMessage.thinking = thinking;
          assistantMessage.content = cleanContent;
        }
      }

      // Normalize tool calls (handle different formats)
      const knownTools = this.toolManager.getAllTools().map(t => t.name);
      assistantMessage = ToolFormatParser.normalizeMessage(assistantMessage, knownTools);

      // Add assistant's response to history
      this.conversationHistory.push(assistantMessage);

      // Check if there are tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        if (verbose) {
          console.log(`\n🔧 Executing ${assistantMessage.tool_calls.length} tool(s):`);
          assistantMessage.tool_calls.forEach((tc, idx) => {
            console.log(`\n  ${idx + 1}. ${tc.function.name}`);
            try {
              const args = JSON.parse(tc.function.arguments);
              const argKeys = Object.keys(args);
              if (argKeys.length > 0) {
                console.log(`     Arguments:`);
                argKeys.forEach(key => {
                  const value = args[key];
                  const displayValue = typeof value === 'string' && value.length > 100
                    ? value.substring(0, 100) + '...'
                    : JSON.stringify(value);
                  console.log(`       ${key}: ${displayValue}`);
                });
              }
            } catch (e) {
              console.log(`     Arguments: ${tc.function.arguments}`);
            }
          });
          console.log();
        }

        // Execute all tool calls with retry logic
        const results = await this.toolManager.executeTools(assistantMessage.tool_calls);

        // PERFORMANCE: Single pass through results instead of multiple filter/forEach
        if (verbose) {
          const errors: string[] = [];
          console.log('📊 Tool Results:');

          results.forEach((result, idx) => {
            console.log(`\n  ${idx + 1}. ${result.error ? '❌ Error' : '✅ Success'}`);
            if (result.error) {
              console.log(`     ${result.error}`);
              errors.push(result.error);
            } else if (result.result) {
              const resultStr = JSON.stringify(result.result, null, 2);
              const displayResult = resultStr.length > 200
                ? resultStr.substring(0, 200) + '...'
                : resultStr;
              console.log(`     ${displayResult}`);
            }
          });
          console.log();

          if (errors.length > 0) {
            console.log('[Warning] Some tool calls failed:');
            errors.forEach(err => console.log(`  - ${err}`));
          }
        }

        // Add tool results to conversation
        for (const result of results) {
          const toolMessage: Message = {
            role: 'tool',
            content: result.error || JSON.stringify(result.result, null, 2),
            tool_call_id: result.id,
          };
          this.conversationHistory.push(toolMessage);
        }

        // Continue the loop to get next response
        continue;
      }

      // No tool calls, return the response
      finalResponse = assistantMessage.content;
      break;
    }

    if (iterations >= maxIterations) {
      finalResponse += '\n\n[Warning: Reached maximum iterations limit]';
    }

    return finalResponse;
  }

  /**
   * Run the agent with streaming response
   */
  async *runStream(userMessage: string, agentConfig: AgentConfig = {}): AsyncGenerator<string, void, unknown> {
    if (agentConfig.systemPrompt) {
      this.setSystemPrompt(agentConfig.systemPrompt);
    }

    this.addUserMessage(userMessage);

    // For now, we'll use non-streaming for tool calls
    // Streaming with tool calls is more complex
    const response = await this.run(userMessage, agentConfig);
    yield response;
  }
}
