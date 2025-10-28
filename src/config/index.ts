import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Config } from '../types/index.js';

const DEFAULT_CONFIG: Config = {
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  defaultModel: process.env.DEFAULT_MODEL || 'qwen3-coder:30b',
  availableModels: [],
  temperature: 0.7,
  maxTokens: 4096,
};

export class ConfigManager {
  private config: Config;
  private configPath: string;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.configPath = join(homedir(), '.ollama-code', 'config.json');
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<Config> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const fileConfig = JSON.parse(content);
      this.config = { ...DEFAULT_CONFIG, ...fileConfig };
    } catch (error) {
      // Config file doesn't exist or is invalid, use defaults
      if ((error as any).code !== 'ENOENT') {
        console.warn('Failed to load config, using defaults:', error);
      }
    }
    return this.config;
  }

  /**
   * Save configuration to file
   */
  async save(config?: Partial<Config>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Ensure directory exists
    const dir = join(homedir(), '.ollama-code');
    await fs.mkdir(dir, { recursive: true });

    // Write config
    await fs.writeFile(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      'utf-8'
    );
  }

  /**
   * Get current configuration
   */
  get(): Config {
    return this.config;
  }

  /**
   * Update configuration
   */
  update(partial: Partial<Config>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
  }
}
