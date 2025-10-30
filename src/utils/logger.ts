/**
 * Logger service for consistent logging across the application
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: any;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;

  private constructor() {
    // Default to 'info', but can be overridden by environment variable
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
    this.logLevel = ['debug', 'info', 'warn', 'error'].includes(envLevel)
      ? envLevel
      : 'info';
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Set the log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get the current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const targetLevelIndex = levels.indexOf(level);
    return targetLevelIndex >= currentLevelIndex;
  }

  /**
   * Format context for display
   */
  private formatContext(context?: LogContext): string {
    if (!context || Object.keys(context).length === 0) {
      return '';
    }
    try {
      return ' ' + JSON.stringify(context);
    } catch {
      return ' [context serialization failed]';
    }
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}${this.formatContext(context)}`);
    }
  }

  /**
   * Info level logging
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}${this.formatContext(context)}`);
    }
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}${this.formatContext(context)}`);
    }
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const contextStr = this.formatContext(context);
      console.error(`[ERROR] ${message}${errorMessage ? ': ' + errorMessage : ''}${contextStr}`);

      // Only show stack trace in debug mode
      if (this.logLevel === 'debug' && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
    }
  }

  /**
   * Log tool execution
   */
  tool(toolName: string, action: 'start' | 'success' | 'error', context?: LogContext): void {
    const emoji = action === 'start' ? '🔧' : action === 'success' ? '✅' : '❌';
    const level: LogLevel = action === 'error' ? 'error' : 'info';

    if (this.shouldLog(level)) {
      const message = `${emoji} Tool: ${toolName} (${action})`;
      if (level === 'error') {
        this.error(message, undefined, context);
      } else {
        this.info(message, context);
      }
    }
  }

  /**
   * Log API calls
   */
  api(endpoint: string, method: string, status: 'request' | 'success' | 'error', context?: LogContext): void {
    const emoji = status === 'request' ? '📡' : status === 'success' ? '✅' : '❌';
    const level: LogLevel = status === 'error' ? 'error' : 'debug';

    if (this.shouldLog(level)) {
      const message = `${emoji} API: ${method} ${endpoint} (${status})`;
      if (level === 'error') {
        this.error(message, undefined, context);
      } else {
        this.debug(message, context);
      }
    }
  }

  /**
   * Log model operations
   */
  model(operation: string, status: 'start' | 'success' | 'error', context?: LogContext): void {
    const emoji = status === 'start' ? '🤖' : status === 'success' ? '✅' : '❌';
    const level: LogLevel = status === 'error' ? 'error' : 'info';

    if (this.shouldLog(level)) {
      const message = `${emoji} Model: ${operation} (${status})`;
      if (level === 'error') {
        this.error(message, undefined, context);
      } else {
        this.info(message, context);
      }
    }
  }
}

/**
 * Export singleton instance
 */
export const logger = Logger.getInstance();
