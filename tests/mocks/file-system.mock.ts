import { vi } from 'vitest';
import type { Stats } from 'fs';

/**
 * Mock file system for testing
 */
export class MockFileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  constructor() {
    // Add default root directory
    this.directories.add('/');
  }

  /**
   * Add a mock file
   */
  addFile(path: string, content: string) {
    this.files.set(path, content);
    // Add parent directories
    const parts = path.split('/').slice(0, -1);
    let current = '';
    for (const part of parts) {
      current += part + '/';
      this.directories.add(current);
    }
  }

  /**
   * Add a mock directory
   */
  addDirectory(path: string) {
    this.directories.add(path.endsWith('/') ? path : path + '/');
  }

  /**
   * Check if file exists
   */
  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  /**
   * Check if directory exists
   */
  hasDirectory(path: string): boolean {
    const normalized = path.endsWith('/') ? path : path + '/';
    return this.directories.has(normalized);
  }

  /**
   * Get file content
   */
  getFileContent(path: string): string | undefined {
    return this.files.get(path);
  }

  /**
   * List directory contents
   */
  listDirectory(path: string): string[] {
    const normalized = path.endsWith('/') ? path : path + '/';
    const contents: string[] = [];

    // Find all direct children
    for (const file of this.files.keys()) {
      if (file.startsWith(normalized)) {
        const relative = file.slice(normalized.length);
        if (!relative.includes('/')) {
          contents.push(relative);
        }
      }
    }

    for (const dir of this.directories) {
      if (dir.startsWith(normalized) && dir !== normalized) {
        const relative = dir.slice(normalized.length);
        const firstSlash = relative.indexOf('/');
        if (firstSlash === relative.length - 1) {
          contents.push(relative.slice(0, -1));
        }
      }
    }

    return [...new Set(contents)];
  }

  /**
   * Clear all mock data
   */
  clear() {
    this.files.clear();
    this.directories.clear();
    this.directories.add('/');
  }

  /**
   * Create mock fs.promises module
   */
  createMockFsPromises() {
    return {
      readFile: vi.fn((path: string) => {
        const content = this.files.get(path);
        if (content === undefined) {
          return Promise.reject(new Error(`ENOENT: no such file or directory, open '${path}'`));
        }
        return Promise.resolve(content);
      }),
      writeFile: vi.fn((path: string, content: string) => {
        this.addFile(path, content);
        return Promise.resolve();
      }),
      mkdir: vi.fn((path: string, options?: { recursive?: boolean }) => {
        if (options?.recursive) {
          const parts = path.split('/');
          let current = '';
          for (const part of parts) {
            current += part + '/';
            this.directories.add(current);
          }
        } else {
          this.addDirectory(path);
        }
        return Promise.resolve();
      }),
      readdir: vi.fn((path: string) => {
        return Promise.resolve(this.listDirectory(path));
      }),
      stat: vi.fn((path: string) => {
        if (this.hasFile(path)) {
          return Promise.resolve({
            isFile: () => true,
            isDirectory: () => false,
            size: this.files.get(path)?.length || 0,
          } as Stats);
        }
        if (this.hasDirectory(path)) {
          return Promise.resolve({
            isFile: () => false,
            isDirectory: () => true,
            size: 0,
          } as Stats);
        }
        return Promise.reject(new Error(`ENOENT: no such file or directory, stat '${path}'`));
      }),
      unlink: vi.fn((path: string) => {
        if (!this.files.has(path)) {
          return Promise.reject(new Error(`ENOENT: no such file or directory, unlink '${path}'`));
        }
        this.files.delete(path);
        return Promise.resolve();
      }),
      rmdir: vi.fn((path: string) => {
        const normalized = path.endsWith('/') ? path : path + '/';
        if (!this.directories.has(normalized)) {
          return Promise.reject(new Error(`ENOENT: no such file or directory, rmdir '${path}'`));
        }
        this.directories.delete(normalized);
        return Promise.resolve();
      }),
    };
  }
}

/**
 * Create a mock file system instance
 */
export function createMockFileSystem(): MockFileSystem {
  return new MockFileSystem();
}
