import { promises as fs } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import type { ToolManager } from '../tools/tool-manager.js';
import type { ToolDefinition } from '../types/index.js';

export type PluginType = 'tool' | 'command' | 'hook' | 'mixed';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  main?: string;
  type?: PluginType;
  permissions?: string[];
  commands?: string[];
  agents?: string[];
  hooks?: string[];
}

export interface PluginAPI {
  registerTool: (tool: ToolDefinition) => void;
  registerCommand: (command: any) => void;
  registerHook: (hook: any) => void;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  path: string;
  instance?: any;
  initialized: boolean;
}

export class PluginLoader {
  private pluginDirs: string[] = [];
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private toolManager?: ToolManager;
  private commandRegistry?: Map<string, any>;
  private hookRegistry?: Map<string, any[]>;

  setToolManager(toolManager: ToolManager): void {
    this.toolManager = toolManager;
  }

  setCommandRegistry(commandRegistry: Map<string, any>): void {
    this.commandRegistry = commandRegistry;
  }

  setHookRegistry(hookRegistry: Map<string, any[]>): void {
    this.hookRegistry = hookRegistry;
  }

  addPluginDirectory(dir: string): void {
    this.pluginDirs.push(dir);
  }

  async loadPlugins(): Promise<void> {
    for (const dir of this.pluginDirs) {
      await this.loadPluginsFromDirectory(dir);
    }
  }

  private async loadPluginsFromDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = join(dir, entry.name);
          await this.loadPlugin(pluginPath);
        }
      }
    } catch (error) {
      console.warn(`Cannot load plugins from ${dir}:`, error);
    }
  }

  private async loadPlugin(pluginPath: string): Promise<void> {
    try {
      const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(manifestContent);

      const loadedPlugin: LoadedPlugin = {
        manifest,
        path: pluginPath,
        initialized: false
      };

      this.loadedPlugins.set(manifest.name, loadedPlugin);
      console.log(`Loaded plugin manifest: ${manifest.name} v${manifest.version}`);

      if (manifest.main) {
        await this.loadPluginCode(loadedPlugin);
      }
    } catch (error) {
      console.warn(`Failed to load plugin from ${pluginPath}:`, error);
    }
  }

  private async loadPluginCode(plugin: LoadedPlugin): Promise<void> {
    try {
      const pluginMainPath = join(plugin.path, plugin.manifest.main!);

      try {
        await fs.access(pluginMainPath);
      } catch {
        console.warn(`Plugin entry point not found: ${pluginMainPath}`);
        return;
      }

      const pluginUrl = pathToFileURL(pluginMainPath).href;
      const pluginModule = await import(pluginUrl);
      const api = this.createPluginAPI(plugin);

      if (pluginModule.initialize && typeof pluginModule.initialize === 'function') {
        await pluginModule.initialize(api);
        plugin.initialized = true;
        console.log(`Initialized plugin: ${plugin.manifest.name}`);
      } else if (pluginModule.default && typeof pluginModule.default === 'function') {
        await pluginModule.default(api);
        plugin.initialized = true;
        console.log(`Initialized plugin (default export): ${plugin.manifest.name}`);
      } else {
        console.warn(`Plugin ${plugin.manifest.name} has no initialize function`);
      }

      plugin.instance = pluginModule;
    } catch (error) {
      console.error(`Failed to load plugin code for ${plugin.manifest.name}:`, error);
      throw error;
    }
  }

  private createPluginAPI(plugin: LoadedPlugin): PluginAPI {
    return {
      registerTool: (tool: ToolDefinition) => {
        if (!this.toolManager) {
          console.warn(`Plugin ${plugin.manifest.name}: ToolManager not available`);
          return;
        }
        console.log(`Plugin ${plugin.manifest.name} registering tool: ${tool.name}`);
        this.toolManager.registerTool(tool);
      },
      registerCommand: (command: any) => {
        if (!this.commandRegistry) {
          console.warn(`Plugin ${plugin.manifest.name}: CommandRegistry not available`);
          return;
        }
        console.log(`Plugin ${plugin.manifest.name} registering command: ${command.name}`);
        this.commandRegistry.set(command.name, command);
      },
      registerHook: (hook: any) => {
        if (!this.hookRegistry) {
          console.warn(`Plugin ${plugin.manifest.name}: HookRegistry not available`);
          return;
        }
        const hookName = hook.name || 'unnamed';
        console.log(`Plugin ${plugin.manifest.name} registering hook: ${hookName}`);

        if (!this.hookRegistry.has(hookName)) {
          this.hookRegistry.set(hookName, []);
        }
        this.hookRegistry.get(hookName)!.push(hook);
      },
      logger: {
        info: (msg: string) => console.log(`[Plugin:${plugin.manifest.name}] ${msg}`),
        warn: (msg: string) => console.warn(`[Plugin:${plugin.manifest.name}] ${msg}`),
        error: (msg: string) => console.error(`[Plugin:${plugin.manifest.name}] ${msg}`),
        debug: (msg: string) => {
          if (process.env.DEBUG) {
            console.log(`[Plugin:${plugin.manifest.name}] [DEBUG] ${msg}`);
          }
        },
      },
    };
  }

  getLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values());
  }

  getPlugin(name: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(name);
  }

  getPluginManifests(): PluginManifest[] {
    return Array.from(this.loadedPlugins.values()).map(p => p.manifest);
  }
}
