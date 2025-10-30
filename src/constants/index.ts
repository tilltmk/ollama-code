/**
 * Global constants for the Ollama Code application
 * Centralized magic strings and configuration values
 */

export const UI = {
  PROMPTS: {
    REPL: '💻 ollama-code ❯ ',
    MULTILINE: '... ',
    EXIT: 'exit',
    THINKING: '💭 Thinking Process',
  },
  COLORS: {
    ERROR: 'red',
    SUCCESS: 'green',
    WARNING: 'yellow',
    INFO: 'cyan',
  },
  MESSAGES: {
    WELCOME: '🚀 Ollama Code Assistant (Enhanced)',
    WELCOME_SUBTITLE: '100% Local • 100% Free • 100% Private',
    GOODBYE: '👋 Goodbye!',
    INITIALIZED: 'Ready!',
    INIT_FAILED: 'Initialization failed',
    ERROR_DURING_INIT: 'Error during initialization:',
    CHECK_CONFIG: 'Please check your configuration and try again.',
  },
  ICONS: {
    ARROW: '❯',
    CHECK: '✓',
    ERROR: '❌',
    WARNING: '⚠',
    PIPE: '│',
    COST_SAVED: '🎉',
    THINKING: '💭',
  },
};

export const DEFAULTS = {
  AGENT: {
    MAX_ITERATIONS: 50,
    MAX_RETRIES: 3,
    MAX_HISTORY_SIZE: 50,
    TIMEOUT: 120000,
  },
  OLLAMA: {
    URL: 'http://localhost:11434',
    MODEL: 'qwen3-coder:30b',
    TIMEOUT: 10 * 60 * 1000, // 10 minutes
  },
  CONFIG: {
    TEMPERATURE: 0.7,
    MAX_TOKENS: 4096,
    LOG_LEVEL: 'info',
  },
  TOOLS: {
    BASH_TIMEOUT: 120000,
    BASH_TIMEOUT_MAX: 600000,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  },
  CALLBACK: {
    MAX_TASKS: 100,
    MAX_ITERATIONS: 50,
    AUTO_CLOSE_TIMEOUT: 5 * 60 * 1000, // 5 minutes
    WORK_DIR: '.ollama-code-queue',
    QUEUE_FILE: 'task-queue.json',
  },
  SIGINT: {
    DOUBLE_PRESS_WINDOW: 2000, // 2 seconds
    KEEPALIVE_INTERVAL: 1000 * 60 * 60, // 1 hour
  },
  COST: {
    CLAUDE_PER_MILLION_TOKENS: 3.0,
    TOKENS_PER_CHAR: 4,
  },
};

export const ERROR_CODES = {
  VALIDATION: 'VALIDATION_ERROR',
  TIMEOUT: 'TIMEOUT_ERROR',
  API: 'API_ERROR',
  TOOL: 'TOOL_ERROR',
  CONFIG: 'CONFIG_ERROR',
  NETWORK: 'NETWORK_ERROR',
  MODEL: 'MODEL_ERROR',
} as const;

export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

export const COMMANDS = {
  HELP: '/help',
  MODELS: '/models',
  MODEL: '/model',
  VERBOSE: '/verbose',
  THINKING: '/thinking',
  MD: '/md',
  MULTILINE: '/multiline',
  LOAD: '/load',
  STATS: '/stats',
  TOOLS: '/tools',
  CLEAR: '/clear',
  RESET: '/reset',
  EXIT: '/exit',
  QUIT: '/quit',
  END: '/end',
  CANCEL: '/cancel',
} as const;

export const REGEX_PATTERNS = {
  THINKING: /(?:<thinking>|<reasoning>|<thought>|\[THINKING\]|\[REASONING\])([\s\S]*?)(?:<\/thinking>|<\/reasoning>|<\/thought>|\[\/THINKING\]|\[\/REASONING\])/i,
  URL: /^https?:\/\//,
} as const;

export const TOOL_CATEGORIES = {
  FILE_OPERATIONS: ['read_file', 'write_file', 'edit_file', 'glob'] as const,
  CODE_SEARCH: ['grep'] as const,
  SYSTEM: ['bash'] as const,
  MULTI_AGENT: ['delegate_to_subagents'] as const,
  DATABASE: (name: string) => name.startsWith('sql_'),
  HTTP: (name: string) => name.startsWith('http_'),
  WORKFLOW: (name: string) =>
    name.startsWith('start_callback') ||
    name.startsWith('add_callback') ||
    name.startsWith('get_callback') ||
    name.startsWith('process_claude'),
} as const;

export const ENV_VARS = {
  OLLAMA_URL: 'OLLAMA_URL',
  DEFAULT_MODEL: 'DEFAULT_MODEL',
  LOG_LEVEL: 'LOG_LEVEL',
  TIMEOUT: 'TIMEOUT',
  MAX_RETRIES: 'MAX_RETRIES',
  ENABLE_SUB_AGENTS: 'ENABLE_SUB_AGENTS',
} as const;

export const FILE_PATHS = {
  CONFIG_DIR: '.ollama-code',
  CONFIG_FILE: 'config.json',
} as const;

export const HTTP = {
  DEFAULT_TIMEOUT: 30000,
} as const;

export const DISPLAY = {
  LINE_LENGTH: 50,
  TOOL_NAME_WIDTH: 25,
  TOOL_DESC_MAX_LENGTH: 50,
  SEPARATOR: '─',
} as const;

export const MODEL_SCORING = {
  BEST_FOR_SCORE: 50,
} as const;

export const STATUS_CODES = {
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const;
