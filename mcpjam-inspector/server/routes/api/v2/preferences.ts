/**
 * User preferences routes (single-record CRUD for local mode).
 */

import { Hono } from "hono";
import { isSqliteMode, getDb } from "../../../db/connection";

const app = new Hono();

// Get preferences
app.get("/", (c) => {
  if (!isSqliteMode()) return c.json({ error: "SQLite mode not active" }, 400);
  const db = getDb();
  const row = db.prepare("SELECT * FROM user_preferences WHERE id = 1").get() as Record<string, unknown> | undefined;
  if (!row) return c.json({ name: "Local User", email: null, preferences: {} });
  return c.json({ _id: row.id, name: row.name, email: row.email, preferences: JSON.parse(row.preferences as string), createdAt: row.created_at, updatedAt: row.updated_at });
});

// Update preferences
app.patch("/", async (c) => {
  const body = await c.req.json();
  const db = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) { updates.push("name = ?"); values.push(body.name); }
  if (body.email !== undefined) { updates.push("email = ?"); values.push(body.email); }
  if (body.preferences !== undefined) { updates.push("preferences = ?"); values.push(JSON.stringify(body.preferences)); }
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    db.prepare(`UPDATE user_preferences SET ${updates.join(", ")} WHERE id = 1`).run(...values);
  }
  const row = db.prepare("SELECT * FROM user_preferences WHERE id = 1").get() as Record<string, unknown>;
  return c.json({ name: row.name, email: row.email, preferences: JSON.parse(row.preferences as string) });
});

export default app;