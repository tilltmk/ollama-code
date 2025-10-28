import { promises as fs } from 'fs';
import { join } from 'path';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  commands?: string[];
  agents?: string[];
  hooks?: string[];
}

export class PluginLoader {
  private pluginDirs: string[] = [];
  private loadedPlugins: Map<string, PluginManifest> = new Map();

  /**
   * Add a directory to search for plugins
   */
  addPluginDirectory(dir: string): void {
    this.pluginDirs.push(dir);
  }

  /**
   * Load all plugins from registered directories
   */
  async loadPlugins(): Promise<void> {
    for (const dir of this.pluginDirs) {
      await this.loadPluginsFromDirectory(dir);
    }
  }

  /**
   * Load plugins from a specific directory
   */
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
      // Directory doesn't exist or can't be read
      console.warn(`Cannot load plugins from ${dir}:`, error);
    }
  }

  /**
   * Load a single plugin
   */
  private async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // Look for .claude-plugin/plugin.json
      const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(manifestContent);

      this.loadedPlugins.set(manifest.name, manifest);
      console.log(`Loaded plugin: ${manifest.name} v${manifest.version}`);
    } catch (error) {
      // Not a valid plugin directory
    }
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): PluginManifest[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Get a specific plugin by name
   */
  getPlugin(name: string): PluginManifest | undefined {
    return this.loadedPlugins.get(name);
  }
}
