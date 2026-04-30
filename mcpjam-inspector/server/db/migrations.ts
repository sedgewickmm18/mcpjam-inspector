/**
 * Database Migrations
 *
 * Handles schema versioning and migration.
 * Uses a simple version tracking table approach.
 */

import type Database from "better-sqlite3";
import { SCHEMA_VERSION, CREATE_TABLES, CREATE_INDEXES } from "./schema";
import { logger as appLogger } from "../utils/logger";

/**
 * Run all pending migrations on the database.
 * Creates tables and indexes if they don't exist.
 */
export function runMigrations(db: Database.Database): void {
  // Get current schema version
  let currentVersion = 0;
  try {
    const row = db
      .prepare("SELECT MAX(version) as version FROM schema_version")
      .get() as { version: number | null } | undefined;
    currentVersion = row?.version ?? 0;
  } catch {
    // Table doesn't exist yet — fresh database
    currentVersion = 0;
  }

  if (currentVersion >= SCHEMA_VERSION) {
    appLogger.info(
      `📦 SQLite schema v${currentVersion} — up to date`,
    );
    return;
  }

  appLogger.info(
    `📦 SQLite schema migration: v${currentVersion} → v${SCHEMA_VERSION}`,
  );

  // Apply all migrations in a transaction
  const migrate = db.transaction(() => {
    // Create all tables (IF NOT EXISTS makes this idempotent)
    for (const sql of CREATE_TABLES) {
      db.exec(sql);
    }

    // Create all indexes (IF NOT EXISTS makes this idempotent)
    for (const sql of CREATE_INDEXES) {
      db.exec(sql);
    }

    // Record the schema version
    db.prepare(
      "INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)",
    ).run(SCHEMA_VERSION, `Initial schema with ${CREATE_TABLES.length} tables`);
  });

  migrate();

  appLogger.info(
    `📦 SQLite schema v${SCHEMA_VERSION} applied (${CREATE_TABLES.length} tables, ${CREATE_INDEXES.length} indexes)`,
  );
}

/**
 * Future migrations can be added here as an array of migration objects.
 * For now, the initial schema is applied via CREATE TABLE IF NOT EXISTS.
 *
 * Example for future use:
 *
 * const MIGRATIONS: Array<{ version: number; description: string; up: string[]; down: string[] }> = [
 *   {
 *     version: 2,
 *     description: "Add last_used_at to servers",
 *     up: ["ALTER TABLE servers ADD COLUMN last_used_at TEXT"],
 *     down: ["-- SQLite doesn't support DROP COLUMN easily"],
 *   },
 * ];
 */