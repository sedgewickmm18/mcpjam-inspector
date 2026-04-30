/**
 * Database Seed Data
 *
 * Populates the database with initial/default data
 * for a fresh local installation.
 */

import type Database from "better-sqlite3";
import { logger as appLogger } from "../utils/logger";

/**
 * Seed the database with default data.
 * Safe to call multiple times — uses INSERT OR IGNORE.
 */
export function seedDatabase(db: Database.Database): void {
  const seed = db.transaction(() => {
    // Default workspace
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, settings) VALUES (?, ?, ?, ?)`,
    ).run(
      "default",
      "My Workspace",
      "Default workspace for local MCP server development",
      JSON.stringify({}),
    );

    // Default user preferences
    db.prepare(
      `INSERT OR IGNORE INTO user_preferences (id, name, email, preferences) VALUES (?, ?, ?, ?)`,
    ).run(1, "Local User", null, JSON.stringify({}));
  });

  seed();
  appLogger.info("📦 SQLite database seeded with defaults");
}