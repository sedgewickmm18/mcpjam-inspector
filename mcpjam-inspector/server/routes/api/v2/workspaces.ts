/**
 * CRUD routes for workspaces.
 */

import { Hono } from "hono";
import { isSqliteMode } from "../../../db/connection";
import { generateId, listRows, getRow, insertRow, updateRow, deleteRow } from "../../../db/crud";

const app = new Hono();

app.get("/", (c) => {
  if (!isSqliteMode()) return c.json({ error: "SQLite mode not active" }, 400);
  const rows = listRows<{ id: string; name: string; description: string | null; settings: string; created_at: string; updated_at: string }>("workspaces", { orderBy: "created_at ASC" });
  return c.json(rows.map((r) => ({ _id: r.id, name: r.name, description: r.description, settings: JSON.parse(r.settings), createdAt: r.created_at, updatedAt: r.updated_at })));
});

app.get("/:id", (c) => {
  const r = getRow<{ id: string; name: string; description: string | null; settings: string; created_at: string; updated_at: string }>("workspaces", c.req.param("id"));
  if (!r) return c.json({ error: "Workspace not found" }, 404);
  return c.json({ _id: r.id, name: r.name, description: r.description, settings: JSON.parse(r.settings), createdAt: r.created_at, updatedAt: r.updated_at });
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const id = generateId();
  const row = insertRow("workspaces", { id, name: body.name || "New Workspace", description: body.description || null, settings: JSON.stringify(body.settings || {}) });
  return c.json({ _id: row.id, name: row.name }, 201);
});

app.patch("/:id", async (c) => {
  const body = await c.req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.settings !== undefined) updates.settings = JSON.stringify(body.settings);
  const updated = updateRow("workspaces", c.req.param("id"), updates);
  if (!updated) return c.json({ error: "Workspace not found" }, 404);
  return c.json({ _id: updated.id, name: updated.name });
});

app.delete("/:id", (c) => {
  if (!deleteRow("workspaces", c.req.param("id"))) return c.json({ error: "Workspace not found" }, 404);
  return c.json({ success: true });
});

export default app;