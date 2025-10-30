import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import type { Config } from '../types/index.js';
import { DEFAULTS, ENV_VARS, FILE_PATHS } from '../constants/index.js';

// Zod schema for configuration validation
const ConfigSchema = z.object({
  ollamaUrl: z.string().url('Invalid Ollama URL format').default(DEFAULTS.OLLAMA.URL),
  defaultModel: z.string().min(1, 'Model name cannot be empty').default(DEFAULTS.OLLAMA.MODEL),
  availableModels: z.array(z.string()).default([]),
  temperature: z.number().min(0, 'Temperature must be >= 0').max(2, 'Temperature must be <= 2').default(DEFAULTS.CONFIG.TEMPERATURE),
  maxTokens: z.number().int('Max tokens must be an integer').positive('Max tokens must be positive').max(100000, 'Max tokens cannot exceed 100000').default(DEFAULTS.CONFIG.MAX_TOKENS),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
  timeout: z.number().int('Timeout must be an integer').positive('Timeout must be positive').optional().default(DEFAULTS.AGENT.TIMEOUT),
  maxRetries: z.number().int('Max retries must be an integer').positive('Max retries must be positive').max(10, 'Max retries cannot exceed 10').optional().default(DEFAULTS.AGENT.MAX_RETRIES),
  enableSubAgents: z.boolean().optional().default(false),
});

const DEFAULT_CONFIG: Config = {
  ollamaUrl: (process.env[ENV_VARS.OLLAMA_URL] ?? null) || DEFAULTS.OLLAMA.URL,
  defaultModel: (process.env[ENV_VARS.DEFAULT_MODEL] ?? null) || DEFAULTS.OLLAMA.MODEL,
  availableModels: [],
  temperature: DEFAULTS.CONFIG.TEMPERATURE,
  maxTokens: DEFAULTS.CONFIG.MAX_TOKENS,
  logLevel: ((process.env[ENV_VARS.LOG_LEVEL] as any) || DEFAULTS.CONFIG.LOG_LEVEL) as 'debug' | 'info' | 'warn' | 'error',
  timeout: (process.env[ENV_VARS.TIMEOUT] ? parseInt(process.env[ENV_VARS.TIMEOUT]!, 10) : DEFAULTS.AGENT.TIMEOUT),
  maxRetries: (process.env[ENV_VARS.MAX_RETRIES] ? parseInt(process.env[ENV_VARS.MAX_RETRIES]!, 10) : DEFAULTS.AGENT.MAX_RETRIES),
  enableSubAgents: (process.env[ENV_VARS.ENABLE_SUB_AGENTS] ?? null) === 'true',
};

export class ConfigManager {
  private config: Config;
  private configPath: string;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.configPath = join(homedir(), FILE_PATHS.CONFIG_DIR, FILE_PATHS.CONFIG_FILE);
  }

  /**
   * Load configuration from file with validation
   */
  async load(): Promise<Config> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const fileConfig = JSON.parse(content);

      // Merge with defaults and validate
      const mergedConfig = { ...DEFAULT_CONFIG, ...fileConfig };
      const validatedConfig = ConfigSchema.parse(mergedConfig);
      this.config = validatedConfig as Config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors
          .map(e => `  - ${e.path.join('.')}: ${e.message}`)
          .join('\n');
        console.error('Configuration validation failed:\n' + errorMessages);
        console.warn('Using default configuration instead');
        this.config = { ...DEFAULT_CONFIG };
      } else if ((error as any).code !== 'ENOENT') {
        console.warn('Failed to load config file:', (error as any).message);
        console.warn('Using default configuration instead');
        this.config = { ...DEFAULT_CONFIG };
      } else {
        this.config = { ...DEFAULT_CONFIG };
      }
    }
    return this.config;
  }

  /**
   * Save configuration to file with validation
   */
  async save(config?: Partial<Config>): Promise<void> {
    try {
      if (config) {
        const mergedConfig = { ...this.config, ...config };
        const validatedConfig = ConfigSchema.parse(mergedConfig);
        this.config = validatedConfig as Config;
      }

      // Ensure directory exists
      const dir = join(homedir(), FILE_PATHS.CONFIG_DIR);
      await fs.mkdir(dir, { recursive: true });

      // Write config
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors
          .map(e => `  - ${e.path.join('.')}: ${e.message}`)
          .join('\n');
        throw new Error(`Configuration validation failed:\n${errorMessages}`);
      }
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  get(): Config {
    return this.config;
  }

  /**
   * Update configuration with validation
   */
  update(partial: Partial<Config>): void {
    try {
      const mergedConfig = { ...this.config, ...partial };
      const validatedConfig = ConfigSchema.parse(mergedConfig);
      this.config = validatedConfig as Config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors
          .map(e => `  - ${e.path.join('.')}: ${e.message}`)
          .join('\n');
        throw new Error(`Configuration validation failed:\n${errorMessages}`);
      }
      throw error;
    }
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
  }
}
