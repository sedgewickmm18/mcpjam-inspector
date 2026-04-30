/**
 * SQLite Database Module
 *
 * Entry point for database initialization.
 * Re-exports all db functionality from a single location.
 */

export { getDb, closeDb, isSqliteMode, getDbPath, isInitialized } from "./connection";
export { runMigrations } from "./migrations";
export { seedDatabase } from "./seed";

import { getDb, closeDb, isSqliteMode, isInitialized } from "./connection";
import { runMigrations } from "./migrations";
import { seedDatabase } from "./seed";
import { logger as appLogger } from "../utils/logger";

/**
 * Initialize the SQLite database if in SQLite mode.
 * - Creates/migrates schema
 * - Seeds default data
 * - Returns true if SQLite was initialized
 */
export function initializeSqlite(): boolean {
  if (!isSqliteMode()) {
    return false;
  }

  try {
    const db = getDb();
    runMigrations(db);
    seedDatabase(db);
    return true;
  } catch (error) {
    appLogger.error("📦 Failed to initialize SQLite database", error);
    throw error;
  }
}

/**
 * Gracefully shut down the database.
 * Safe to call even if SQLite was never initialized.
 */
export function shutdownSqlite(): void {
  closeDb();
}