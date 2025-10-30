/**
 * SQLite Tool
 * Allows agents to interact with SQLite databases
 */

import { z } from 'zod';
import Database from 'better-sqlite3';
import type { ToolDefinition } from '../types/index.js';
import path from 'path';

// Cache configuration
const MAX_CACHE_SIZE = 20;
const AUTO_CLOSE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Cache for database connections with auto-close timers
interface CacheEntry {
  db: Database.Database;
  timer?: NodeJS.Timeout;
}

const dbCache = new Map<string, CacheEntry>();

/**
 * Close all cached database connections
 */
function closeAllDatabases(): void {
  for (const [dbPath, entry] of dbCache.entries()) {
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    try {
      entry.db.close();
    } catch (e) {
      console.error(`Failed to close database ${dbPath}:`, e);
    }
  }
  dbCache.clear();
}

// Register cleanup handlers
process.on('exit', closeAllDatabases);
process.on('SIGINT', () => {
  closeAllDatabases();
  process.exit();
});
process.on('SIGTERM', () => {
  closeAllDatabases();
  process.exit();
});

/**
 * Get or create a database connection with auto-close and cache management
 */
function getDatabase(filepath: string): Database.Database {
  const absolutePath = path.resolve(filepath);

  // Check if database is already cached
  if (dbCache.has(absolutePath)) {
    const entry = dbCache.get(absolutePath)!;

    // Clear existing timer
    if (entry.timer) {
      clearTimeout(entry.timer);
    }

    // Set new auto-close timer
    entry.timer = setTimeout(() => {
      try {
        entry.db.close();
        dbCache.delete(absolutePath);
      } catch (e) {
        console.error(`Failed to auto-close database ${absolutePath}:`, e);
      }
    }, AUTO_CLOSE_TIMEOUT);

    return entry.db;
  }

  // Enforce cache size limit
  if (dbCache.size >= MAX_CACHE_SIZE) {
    // Close and remove oldest entry (first in map)
    const oldestKey = dbCache.keys().next().value;
    if (oldestKey) {
      const oldEntry = dbCache.get(oldestKey)!;
      if (oldEntry.timer) {
        clearTimeout(oldEntry.timer);
      }
      try {
        oldEntry.db.close();
      } catch (e) {
        console.error(`Failed to close database ${oldestKey}:`, e);
      }
      dbCache.delete(oldestKey);
    }
  }

  // Create new database connection
  const db = new Database(absolutePath);
  const timer = setTimeout(() => {
    try {
      db.close();
      dbCache.delete(absolutePath);
    } catch (e) {
      console.error(`Failed to auto-close database ${absolutePath}:`, e);
    }
  }, AUTO_CLOSE_TIMEOUT);

  dbCache.set(absolutePath, { db, timer });
  return db;
}

// Schema for SQL query execution
const sqlQuerySchema = z.object({
  database: z.string().describe('Path to SQLite database file'),
  query: z.string().describe('SQL query to execute'),
  params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().describe('Query parameters (for prepared statements)')
});

async function executeSqlQuery(args: z.infer<typeof sqlQuerySchema>): Promise<string> {
  try {
    const db = getDatabase(args.database);
    const query = args.query.trim();

    // Check if it's a SELECT or other read query
    if (query.toUpperCase().startsWith('SELECT') ||
        query.toUpperCase().startsWith('PRAGMA') ||
        query.toUpperCase().startsWith('EXPLAIN')) {

      const stmt = db.prepare(query);
      const results = args.params ? stmt.all(...args.params) : stmt.all();

      if (results.length === 0) {
        return 'Query returned no results.';
      }

      return JSON.stringify(results, null, 2);

    } else {
      // Write query (INSERT, UPDATE, DELETE, CREATE, etc.)
      const stmt = db.prepare(query);
      const info = args.params ? stmt.run(...args.params) : stmt.run();

      return JSON.stringify({
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        message: 'Query executed successfully'
      }, null, 2);
    }

  } catch (error) {
    return `SQL Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Schema for creating tables
const createTableSchema = z.object({
  database: z.string().describe('Path to SQLite database file'),
  table_name: z.string().describe('Name of the table to create'),
  columns: z.array(z.object({
    name: z.string(),
    type: z.enum(['TEXT', 'INTEGER', 'REAL', 'BLOB', 'NULL']),
    constraints: z.string().optional().describe('Column constraints (e.g., "PRIMARY KEY", "NOT NULL")')
  })).describe('Column definitions')
});

async function createTable(args: z.infer<typeof createTableSchema>): Promise<string> {
  try {
    const db = getDatabase(args.database);

    const columnDefs = args.columns.map(col => {
      return `${col.name} ${col.type}${col.constraints ? ' ' + col.constraints : ''}`;
    }).join(', ');

    const query = `CREATE TABLE IF NOT EXISTS ${args.table_name} (${columnDefs})`;
    db.prepare(query).run();

    return `Table '${args.table_name}' created successfully.`;
  } catch (error) {
    return `Error creating table: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Schema for listing tables
const listTablesSchema = z.object({
  database: z.string().describe('Path to SQLite database file')
});

async function listTables(args: z.infer<typeof listTablesSchema>): Promise<string> {
  try {
    const db = getDatabase(args.database);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

    if (tables.length === 0) {
      return 'No tables found in database.';
    }

    return JSON.stringify(tables, null, 2);
  } catch (error) {
    return `Error listing tables: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Schema for describing table schema
const describeTableSchema = z.object({
  database: z.string().describe('Path to SQLite database file'),
  table_name: z.string().describe('Name of the table to describe')
});

async function describeTable(args: z.infer<typeof describeTableSchema>): Promise<string> {
  try {
    const db = getDatabase(args.database);
    const schema = db.prepare(`PRAGMA table_info(${args.table_name})`).all();

    if (schema.length === 0) {
      return `Table '${args.table_name}' not found.`;
    }

    return JSON.stringify(schema, null, 2);
  } catch (error) {
    return `Error describing table: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Schema for closing database connections
const closeDatabaseSchema = z.object({
  database: z.string().describe('Path to SQLite database file')
});

async function closeDatabase(args: z.infer<typeof closeDatabaseSchema>): Promise<string> {
  try {
    const absolutePath = path.resolve(args.database);

    if (dbCache.has(absolutePath)) {
      const entry = dbCache.get(absolutePath)!;

      // Clear the auto-close timer
      if (entry.timer) {
        clearTimeout(entry.timer);
      }

      // Close the database
      entry.db.close();
      dbCache.delete(absolutePath);
      return `Database '${args.database}' closed successfully.`;
    }

    return `Database '${args.database}' was not open.`;
  } catch (error) {
    return `Error closing database: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Tool definitions
export const sqliteTools: ToolDefinition[] = [
  {
    name: 'sql_query',
    description: 'Execute SQL query on a SQLite database. Supports SELECT, INSERT, UPDATE, DELETE, CREATE, etc.',
    schema: sqlQuerySchema,
    executor: executeSqlQuery
  },
  {
    name: 'sql_create_table',
    description: 'Create a new table in a SQLite database',
    schema: createTableSchema,
    executor: createTable
  },
  {
    name: 'sql_list_tables',
    description: 'List all tables in a SQLite database',
    schema: listTablesSchema,
    executor: listTables
  },
  {
    name: 'sql_describe_table',
    description: 'Get the schema of a specific table (columns, types, constraints)',
    schema: describeTableSchema,
    executor: describeTable
  },
  {
    name: 'sql_close_database',
    description: 'Close a database connection (useful for cleanup)',
    schema: closeDatabaseSchema,
    executor: closeDatabase
  }
];
