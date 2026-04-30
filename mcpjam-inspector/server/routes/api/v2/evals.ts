/**
 * CRUD routes for evaluation runs.
 */

import { Hono } from "hono";
import { isSqliteMode, getDb } from "../../../db/connection";
import { generateId, listRows, getRow, updateRow, deleteRow } from "../../../db/crud";

const app = new Hono();

app.get("/", (c) => {
  if (!isSqliteMode()) return c.json({ error: "SQLite mode not active" }, 400);
  const serverId = c.req.query("serverId");
  const rows = listRows<{ id: string; server_id: string; status: string; results: string | null; config: string | null; started_at: string | null; completed_at: string | null; created_at: string }>(
    "eval_runs", { where: serverId ? "server_id = ?" : undefined, whereArgs: serverId ? [serverId] : undefined, orderBy: "created_at DESC" },
  );
  return c.json(rows.map((r) => ({ _id: r.id, serverId: r.server_id, status: r.status, results: r.results ? JSON.parse(r.results) : null, config: r.config ? JSON.parse(r.config) : null, startedAt: r.started_at, completedAt: r.completed_at, createdAt: r.created_at })));
});

app.get("/:id", (c) => {
  const r = getRow<{ id: string; server_id: string; status: string; results: string | null; config: string | null; started_at: string | null; completed_at: string | null; created_at: string }>("eval_runs", c.req.param("id"));
  if (!r) return c.json({ error: "Eval run not found" }, 404);
  return c.json({ _id: r.id, serverId: r.server_id, status: r.status, results: r.results ? JSON.parse(r.results) : null, config: r.config ? JSON.parse(r.config) : null, startedAt: r.started_at, completedAt: r.completed_at, createdAt: r.created_at });
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const db = getDb();
  const id = generateId();
  db.prepare(
    `INSERT INTO eval_runs (id, server_id, status, results, config, started_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ).run(id, body.serverId, body.status || "running", JSON.stringify(body.results || null), JSON.stringify(body.config || null));
  return c.json({ _id: id, status: "running" }, 201);
});

app.patch("/:id", async (c) => {
  const body = await c.req.json();
  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.results !== undefined) updates.results = JSON.stringify(body.results);
  if (body.status === "completed" || body.status === "failed") updates.completed_at = "datetime('now')";
  // Handle completed_at as raw SQL
  const id = c.req.param("id");
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.status !== undefined) { sets.push("status = ?"); values.push(body.status); }
  if (body.results !== undefined) { sets.push("results = ?"); values.push(JSON.stringify(body.results)); }
  if (body.status === "completed" || body.status === "failed") { sets.push("completed_at = datetime('now')"); }
  sets.push("updated_at = datetime('now')");
  values.push(id);
  const result = db.prepare(`UPDATE eval_runs SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  if (result.changes === 0) return c.json({ error: "Eval run not found" }, 404);
  return c.json({ _id: id });
});

app.delete("/:id", (c) => {
  if (!deleteRow("eval_runs", c.req.param("id"))) return c.json({ error: "Eval run not found" }, 404);
  return c.json({ success: true });
});

export default app;