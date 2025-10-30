import { vi } from 'vitest';

/**
 * Mock bash command executor for testing
 */
export class MockBashExecutor {
  private commandResults: Map<string, { stdout: string; stderr: string; exitCode: number }> = new Map();
  public execute = vi.fn();

  constructor() {
    this.setupDefaultBehavior();
  }

  private setupDefaultBehavior() {
    this.execute.mockImplementation((command: string) => {
      const result = this.commandResults.get(command);
      if (result) {
        return Promise.resolve(result);
      }
      // Default success response
      return Promise.resolve({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
    });
  }

  /**
   * Set the result for a specific command
   */
  setCommandResult(command: string, result: { stdout: string; stderr: string; exitCode: number }) {
    this.commandResults.set(command, result);
  }

  /**
   * Set multiple command results
   */
  setCommandResults(results: Record<string, { stdout: string; stderr: string; exitCode: number }>) {
    for (const [command, result] of Object.entries(results)) {
      this.commandResults.set(command, result);
    }
  }

  /**
   * Mock a command to fail
   */
  mockCommandError(command: string, error: Error) {
    this.execute.mockImplementation((cmd: string) => {
      if (cmd === command) {
        return Promise.reject(error);
      }
      return this.execute.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
    });
  }

  /**
   * Clear all command results
   */
  clear() {
    this.commandResults.clear();
    this.execute.mockReset();
    this.setupDefaultBehavior();
  }

  /**
   * Get call history
   */
  getCallHistory(): string[] {
    return this.execute.mock.calls.map((call: any[]) => call[0]);
  }
}

/**
 * Create a mock bash executor instance
 */
export function createMockBashExecutor(): MockBashExecutor {
  return new MockBashExecutor();
}
