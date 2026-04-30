/**
 * Generic CRUD helpers for SQLite tables.
 *
 * Provides reusable parameterized-query builders that keep route
 * handlers thin and consistent.
 */

import type Database from "better-sqlite3";
import { getDb } from "./connection";

/**
 * Generate a random 32-char hex ID (compatible with Convex ID format).
 */
export function generateId(): string {
  const bytes = new Uint8Array(16);
  // Use crypto.getRandomValues for proper randomness
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without crypto
    require("crypto").randomFillSync(bytes);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * List all rows from a table, with optional filters.
 */
export function listRows<T extends Record<string, unknown>>(
  table: string,
  options?: {
    where?: string;
    whereArgs?: unknown[];
    orderBy?: string;
    limit?: number;
    offset?: number;
  },
  db?: Database.Database,
): T[] {
  const database = db ?? getDb();
  const clauses: string[] = [];
  const args: unknown[] = [];

  if (options?.where) {
    clauses.push(`WHERE ${options.where}`);
    args.push(...(options.whereArgs ?? []));
  }

  if (options?.orderBy) {
    clauses.push(`ORDER BY ${options.orderBy}`);
  }

  if (options?.limit) {
    clauses.push("LIMIT ?");
    args.push(options.limit);
  }

  if (options?.offset) {
    clauses.push("OFFSET ?");
    args.push(options.offset);
  }

  const sql = `SELECT * FROM ${table} ${clauses.join(" ")}`;
  return database.prepare(sql).all(...args) as T[];
}

/**
 * Get a single row by ID.
 */
export function getRow<T extends Record<string, unknown>>(
  table: string,
  id: string,
  db?: Database.Database,
): T | undefined {
  const database = db ?? getDb();
  return database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
    | T
    | undefined;
}

/**
 * Insert a row into a table.
 */
export function insertRow<T extends Record<string, unknown>>(
  table: string,
  data: Record<string, unknown>,
  db?: Database.Database,
): T {
  const database = db ?? getDb();
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => "?").join(", ");

  const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
  database.prepare(sql).run(...values);

  // Return the inserted row
  return getRow<T>(table, data.id as string, database)!;
}

/**
 * Update a row by ID.
 */
export function updateRow<T extends Record<string, unknown>>(
  table: string,
  id: string,
  data: Record<string, unknown>,
  db?: Database.Database,
): T | undefined {
  const database = db ?? getDb();
  const keys = Object.keys(data);

  if (keys.length === 0) {
    return getRow<T>(table, id, database);
  }

  // Always update the updated_at timestamp
  const setClauses = [
    ...keys.map((k) => `${k} = ?`),
    "updated_at = datetime('now')",
  ];
  const values = [...Object.values(data), id];

  const sql = `UPDATE ${table} SET ${setClauses.join(", ")} WHERE id = ?`;
  const result = database.prepare(sql).run(...values);

  if (result.changes === 0) return undefined;
  return getRow<T>(table, id, database);
}

/**
 * Delete a row by ID. Returns true if a row was deleted.
 */
export function deleteRow(
  table: string,
  id: string,
  db?: Database.Database,
): boolean {
  const database = db ?? getDb();
  const result = database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return result.changes > 0;
}

/**
 * Count rows in a table with optional filter.
 */
export function countRows(
  table: string,
  where?: string,
  whereArgs?: unknown[],
  db?: Database.Database,
): number {
  const database = db ?? getDb();
  const sql = where
    ? `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`
    : `SELECT COUNT(*) as count FROM ${table}`;
  const row = database.prepare(sql).get(...(whereArgs ?? [])) as {
    count: number;
  };
  return row.count;
}

/**
 * Parse a JSON column value, returning the parsed object or null.
 */
export function parseJsonColumn<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}