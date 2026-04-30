/**
 * SQLite Database Connection
 *
 * Provides a singleton connection to the embedded SQLite database
 * using better-sqlite3. Uses WAL mode for concurrent read support.
 *
 * Activated when PERSISTENCE_MODE=sqlite is set in the environment.
 */

import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { logger as appLogger } from "../utils/logger";

let db: Database.Database | null = null;

/**
 * Get the database file path.
 *
 * Resolution order:
 * 1. SQLITE_DB_PATH env var (explicit path)
 * 2. XDG_DATA_HOME/mcpjam/inspector.db (Linux/macOS standard)
 * 3. ~/.local/share/mcpjam/inspector.db (fallback)
 * 4. ./data/inspector.db (relative to cwd, for Docker)
 */
export function getDbPath(): string {
  if (process.env.SQLITE_DB_PATH) {
    return process.env.SQLITE_DB_PATH;
  }

  // Docker container: use a simple data directory
  if (process.env.DOCKER_CONTAINER === "true") {
    return "/data/inspector.db";
  }

  // Electron app: use user data directory
  if (process.env.ELECTRON_APP === "true") {
    const electronPath = process.env.ELECTRON_USER_DATA_PATH;
    if (electronPath) {
      return join(electronPath, "inspector.db");
    }
  }

  // Standard XDG data directory
  const xdgDataHome =
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(xdgDataHome, "mcpjam", "inspector.db");
}

/**
 * Check if SQLite persistence mode is enabled.
 */
export function isSqliteMode(): boolean {
  return (
    process.env.PERSISTENCE_MODE === "sqlite" ||
    // Auto-detect: if no Convex URL is configured, use SQLite
    (!process.env.CONVEX_URL && !process.env.VITE_CONVEX_URL)
  );
}

/**
 * Get or create the singleton database connection.
 * Throws if not in SQLite mode.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();

  // Ensure the directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  appLogger.info(`📦 SQLite database: ${dbPath}`);

  db = new Database(dbPath);

  // Enable WAL mode for concurrent reads + better write performance
  db.pragma("journal_mode = WAL");

  // Enable foreign key enforcement
  db.pragma("foreign_keys = ON");

  // Busy timeout: wait up to 5 seconds for locks
  db.pragma("busy_timeout = 5000");

  // Performance optimizations
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 268435456"); // 256MB memory-mapped I/O
  db.pragma("cache_size = -8000"); // 8MB cache

  return db;
}

/**
 * Close the database connection gracefully.
 */
export function closeDb(): void {
  if (db) {
    appLogger.info("📦 Closing SQLite database");
    // Optimize the database before closing
    try {
      db.pragma("optimize");
    } catch {
      // Ignore errors during optimization
    }
    db.close();
    db = null;
  }
}

/**
 * Check if the database has been initialized (has the schema_version table).
 */
export function isInitialized(): boolean {
  if (!db) return false;
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
    )
    .get();
  return !!row;
}