/**
 * Custom error classes for structured error handling
 */

export abstract class BaseError extends Error {
  abstract code: string;
  abstract statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      stack: this.stack,
    };
  }
}

export class ValidationError extends BaseError {
  code = 'VALIDATION_ERROR';
  statusCode = 400;

  constructor(message: string, public field?: string, public value?: any) {
    super(message);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      field: this.field,
      value: this.value,
    };
  }
}

export class TimeoutError extends BaseError {
  code = 'TIMEOUT';
  statusCode = 408;

  constructor(message: string = 'Operation timed out') {
    super(message);
  }
}

export class ApiError extends BaseError {
  code = 'API_ERROR';

  constructor(message: string, public statusCode: number = 500, public details?: any) {
    super(message);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

export class ToolExecutionError extends BaseError {
  code = 'TOOL_EXECUTION_ERROR';
  statusCode = 500;

  constructor(
    message: string,
    public toolName: string,
    public originalError?: Error
  ) {
    super(message);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      toolName: this.toolName,
      originalError: this.originalError?.message,
    };
  }
}

export class ConfigError extends BaseError {
  code = 'CONFIG_ERROR';
  statusCode = 500;

  constructor(message: string, public configKey?: string) {
    super(message);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      configKey: this.configKey,
    };
  }
}

export class NetworkError extends BaseError {
  code = 'NETWORK_ERROR';
  statusCode = 503;

  constructor(message: string, public url?: string) {
    super(message);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      url: this.url,
    };
  }
}

export class ModelError extends BaseError {
  code = 'MODEL_ERROR';
  statusCode = 500;

  constructor(message: string, public modelName?: string) {
    super(message);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      modelName: this.modelName,
    };
  }
}

/**
 * Error handler utility function
 */
export function handleError(error: unknown): BaseError {
  if (error instanceof BaseError) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError(error.message, 500);
  }

  return new ApiError(String(error), 500);
}

/**
 * Format error for user display
 */
export function formatErrorForDisplay(error: unknown): string {
  if (error instanceof BaseError) {
    return `[${error.code}] ${error.message}`;
  }

  if (error instanceof Error) {
    return `[ERROR] ${error.message}`;
  }

  return `[UNKNOWN ERROR] ${String(error)}`;
}
