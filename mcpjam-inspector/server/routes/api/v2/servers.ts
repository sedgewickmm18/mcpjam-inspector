/**
 * CRUD routes for MCP server configurations.
 * POST /api/v2/servers              — Create a server
 * GET  /api/v2/servers              — List all servers (optional ?workspaceId=)
 * GET  /api/v2/servers/:id          — Get a server
 * PATCH  /api/v2/servers/:id        — Update a server
 * DELETE /api/v2/servers/:id        — Delete a server
 */

import { Hono } from "hono";
import { getDb, isSqliteMode } from "../../../db/connection";
import {
  generateId,
  listRows,
  getRow,
  insertRow,
  updateRow,
  deleteRow,
} from "../../../db/crud";

const app = new Hono();

// List servers
app.get("/", (c) => {
  if (!isSqliteMode()) {
    return c.json({ error: "SQLite mode not active" }, 400);
  }

  const workspaceId = c.req.query("workspaceId");
  const servers = listRows<{
    id: string;
    name: string;
    transport_type: string;
    config: string;
    workspace_id: string | null;
    created_at: string;
    updated_at: string;
  }>(
    "servers",
    workspaceId
      ? { where: "workspace_id = ?", whereArgs: [workspaceId] }
      : undefined,
  );

  return c.json(
    servers.map((s) => ({
      _id: s.id,
      name: s.name,
      transportType: s.transport_type,
      config: JSON.parse(s.config),
      workspaceId: s.workspace_id,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    })),
  );
});

// Get a single server
app.get("/:id", (c) => {
  const server = getRow<{
    id: string;
    name: string;
    transport_type: string;
    config: string;
    workspace_id: string | null;
    created_at: string;
    updated_at: string;
  }>("servers", c.req.param("id"));

  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  return c.json({
    _id: server.id,
    name: server.name,
    transportType: server.transport_type,
    config: JSON.parse(server.config),
    workspaceId: server.workspace_id,
    createdAt: server.created_at,
    updatedAt: server.updated_at,
  });
});

// Create a server
app.post("/", async (c) => {
  const body = await c.req.json();
  const id = generateId();

  const row = insertRow("servers", {
    id,
    name: body.name || "Untitled Server",
    transport_type: body.transportType || "stdio",
    config: JSON.stringify(body.config || {}),
    workspace_id: body.workspaceId || "default",
  });

  return c.json(
    {
      _id: row.id,
      name: row.name,
      transportType: row.transport_type,
      config: JSON.parse(row.config as string),
      workspaceId: row.workspace_id,
    },
    201,
  );
});

// Update a server
app.patch("/:id", async (c) => {
  const body = await c.req.json();
  const id = c.req.param("id");

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.transportType !== undefined)
    updates.transport_type = body.transportType;
  if (body.config !== undefined) updates.config = JSON.stringify(body.config);
  if (body.workspaceId !== undefined) updates.workspace_id = body.workspaceId;

  const updated = updateRow("servers", id, updates);
  if (!updated) {
    return c.json({ error: "Server not found" }, 404);
  }

  return c.json({
    _id: updated.id,
    name: updated.name,
    transportType: updated.transport_type,
    config: JSON.parse(updated.config as string),
    workspaceId: updated.workspace_id,
  });
});

// Delete a server
app.delete("/:id", (c) => {
  const deleted = deleteRow("servers", c.req.param("id"));
  if (!deleted) {
    return c.json({ error: "Server not found" }, 404);
  }
  return c.json({ success: true });
});

export default app;