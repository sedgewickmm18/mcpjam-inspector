/**
 * CRUD routes for inspector session-to-server mappings.
 */

import { Hono } from "hono";
import { isSqliteMode, getDb } from "../../../db/connection";
import { generateId, listRows, deleteRow } from "../../../db/crud";

const app = new Hono();

// List session servers
app.get("/", (c) => {
  if (!isSqliteMode()) return c.json({ error: "SQLite mode not active" }, 400);
  const sessionId = c.req.query("sessionId");
  if (!sessionId) return c.json({ error: "sessionId query param required" }, 400);
  const rows = listRows<{ id: string; session_id: string; server_id: string; config: string; created_at: string }>(
    "inspector_session_servers",
    { where: "session_id = ?", whereArgs: [sessionId] },
  );
  return c.json(rows.map((r) => ({ _id: r.id, sessionId: r.session_id, serverId: r.server_id, config: JSON.parse(r.config), createdAt: r.created_at })));
});

// Create or update session server (upsert)
app.post("/", async (c) => {
  const body = await c.req.json();
  const { sessionId, serverId, config } = body;
  if (!sessionId || !serverId) return c.json({ error: "sessionId and serverId required" }, 400);

  const db = getDb();
  const id = generateId();
  db.prepare(
    `INSERT INTO inspector_session_servers (id, session_id, server_id, config) VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id, server_id) DO UPDATE SET config = excluded.config`,
  ).run(id, sessionId, serverId, JSON.stringify(config || {}));

  return c.json({ success: true }, 201);
});

// Remove a session server
app.delete("/:sessionId/:serverId", (c) => {
  const db = getDb();
  const result = db.prepare("DELETE FROM inspector_session_servers WHERE session_id = ? AND server_id = ?").run(c.req.param("sessionId"), c.req.param("serverId"));
  if (result.changes === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

export default app;