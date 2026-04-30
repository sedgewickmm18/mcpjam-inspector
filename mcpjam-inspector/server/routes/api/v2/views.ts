/**
 * CRUD routes for custom views per workspace.
 */

import { Hono } from "hono";
import { isSqliteMode } from "../../../db/connection";
import { generateId, listRows, getRow, insertRow, updateRow, deleteRow } from "../../../db/crud";

const app = new Hono();

app.get("/", (c) => {
  if (!isSqliteMode()) return c.json({ error: "SQLite mode not active" }, 400);
  const workspaceId = c.req.query("workspaceId");
  const rows = listRows<{ id: string; workspace_id: string; type: string; name: string; config: string; created_at: string; updated_at: string }>(
    "views", workspaceId ? { where: "workspace_id = ?", whereArgs: [workspaceId] } : undefined,
  );
  return c.json(rows.map((r) => ({ _id: r.id, workspaceId: r.workspace_id, type: r.type, name: r.name, config: JSON.parse(r.config), createdAt: r.created_at, updatedAt: r.updated_at })));
});

app.get("/:id", (c) => {
  const r = getRow<{ id: string; workspace_id: string; type: string; name: string; config: string }>("views", c.req.param("id"));
  if (!r) return c.json({ error: "View not found" }, 404);
  return c.json({ _id: r.id, workspaceId: r.workspace_id, type: r.type, name: r.name, config: JSON.parse(r.config) });
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const id = generateId();
  insertRow("views", { id, workspace_id: body.workspaceId || "default", type: body.type || "mcp_app", name: body.name || "New View", config: JSON.stringify(body.config || {}) });
  return c.json({ _id: id }, 201);
});

app.patch("/:id", async (c) => {
  const body = await c.req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if (body.config !== undefined) updates.config = JSON.stringify(body.config);
  const updated = updateRow("views", c.req.param("id"), updates);
  if (!updated) return c.json({ error: "View not found" }, 404);
  return c.json({ _id: updated.id });
});

app.delete("/:id", (c) => {
  if (!deleteRow("views", c.req.param("id"))) return c.json({ error: "View not found" }, 404);
  return c.json({ success: true });
});

export default app;