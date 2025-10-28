import { OllamaClient } from './ollama-client.js';
import { ModelManager } from './model-manager.js';
import { ToolManager } from '../tools/tool-manager.js';
import { ToolFormatParser } from './tool-format-parser.js';
import type { Message, Config } from '../types/index.js';

export interface AgentConfig {
  systemPrompt?: string;
  model?: string;
  maxIterations?: number;
  verbose?: boolean;
  maxRetries?: number; // Max retries for failed tool calls
}

/**
 * Extract thinking/reasoning content from message
 * Supports multiple formats: <thinking>...</thinking>, <reasoning>...</reasoning>, etc.
 */
function extractThinking(content: string): { thinking: string | undefined; cleanContent: string } {
  const thinkingPatterns = [
    /<thinking>([\s\S]*?)<\/thinking>/i,
    /<reasoning>([\s\S]*?)<\/reasoning>/i,
    /<thought>([\s\S]*?)<\/thought>/i,
    /\[THINKING\]([\s\S]*?)\[\/THINKING\]/i,
    /\[REASONING\]([\s\S]*?)\[\/REASONING\]/i,
  ];

  let thinking: string | undefined;
  let cleanContent = content;

  for (const pattern of thinkingPatterns) {
    const match = content.match(pattern);
    if (match) {
      thinking = match[1].trim();
      cleanContent = content.replace(pattern, '').trim();
      break;
    }
  }

  return { thinking, cleanContent };
}

export class Agent {
  private client: OllamaClient;
  private modelManager: ModelManager;
  private toolManager: ToolManager;
  private config: Config;
  private conversationHistory: Message[] = [];

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
   * Run the agent with a user message
   */
  async run(userMessage: string, agentConfig: AgentConfig = {}): Promise<string> {
    const maxIterations = agentConfig.maxIterations || 10;
    const maxRetries = agentConfig.maxRetries || 3;
    const model = agentConfig.model || this.modelManager.selectModelForTask('code');
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

      if (verbose) {
        console.log(`\n[Iteration ${iterations}]`);
      }

      // Make API call with tools (with retry logic)
      let response;
      let retryCount = 0;
      while (retryCount < maxRetries) {
        try {
          response = await this.client.chatCompletion({
            model,
            messages: this.conversationHistory,
            tools: this.toolManager.getToolsForOllama(),
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
          });
          break; // Success, exit retry loop
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw error; // Max retries reached, throw error
          }
          if (verbose) {
            console.log(`[Retry ${retryCount}/${maxRetries}] API call failed, retrying...`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
        }
      }

      if (!response) {
        throw new Error('Failed to get response after retries');
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
          console.log(`Tool calls: ${assistantMessage.tool_calls.map(tc => tc.function.name).join(', ')}`);
        }

        // Execute all tool calls with retry logic
        const results = await this.toolManager.executeTools(assistantMessage.tool_calls);

        // Check for errors and potentially retry
        const hasErrors = results.some(r => r.error);
        if (hasErrors && verbose) {
          console.log('[Warning] Some tool calls failed:');
          results.filter(r => r.error).forEach(r => {
            console.log(`  - ${r.error}`);
          });
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
