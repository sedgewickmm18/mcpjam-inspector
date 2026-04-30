/**
 * CRUD routes for chat sessions.
 * GET    /api/v2/chat-sessions           — List all sessions
 * GET    /api/v2/chat-sessions/:id       — Get a session
 * POST   /api/v2/chat-sessions           — Create a session
 * PATCH  /api/v2/chat-sessions/:id       — Update a session
 * DELETE /api/v2/chat-sessions/:id       — Delete a session
 * POST   /api/v2/chat-sessions/:id/messages — Append messages
 * GET    /api/v2/chat-sessions/:id/topic-map — Get topic map
 */

import { Hono } from "hono";
import { getDb, isSqliteMode } from "../../../db/connection";
import { generateId, listRows, getRow, insertRow, updateRow, deleteRow } from "../../../db/crud";

const app = new Hono();

// List sessions
app.get("/", (c) => {
  if (!isSqliteMode()) return c.json({ error: "SQLite mode not active" }, 400);

  const workspaceId = c.req.query("workspaceId");
  const sessions = listRows<{
    id: string; title: string | null; messages: string; model: string | null;
    system_prompt: string | null; server_id: string | null; workspace_id: string | null;
    topic_map: string | null; created_at: string; updated_at: string;
  }>("chat_sessions", {
    where: workspaceId ? "workspace_id = ?" : undefined,
    whereArgs: workspaceId ? [workspaceId] : undefined,
    orderBy: "created_at DESC",
  });

  return c.json(sessions.map((s) => ({
    _id: s.id, title: s.title, model: s.model, systemPrompt: s.system_prompt,
    serverId: s.server_id, workspaceId: s.workspace_id,
    topicMap: s.topic_map ? JSON.parse(s.topic_map) : null,
    createdAt: s.created_at, updatedAt: s.updated_at,
    messageCount: JSON.parse(s.messages).length,
  })));
});

// Get single session (with full messages)
app.get("/:id", (c) => {
  const s = getRow<{
    id: string; title: string | null; messages: string; model: string | null;
    system_prompt: string | null; server_id: string | null; workspace_id: string | null;
    topic_map: string | null; created_at: string; updated_at: string;
  }>("chat_sessions", c.req.param("id"));

  if (!s) return c.json({ error: "Session not found" }, 404);

  return c.json({
    _id: s.id, title: s.title, messages: JSON.parse(s.messages), model: s.model,
    systemPrompt: s.system_prompt, serverId: s.server_id, workspaceId: s.workspace_id,
    topicMap: s.topic_map ? JSON.parse(s.topic_map) : null,
    createdAt: s.created_at, updatedAt: s.updated_at,
  });
});

// Create session
app.post("/", async (c) => {
  const body = await c.req.json();
  const id = generateId();

  const row = insertRow("chat_sessions", {
    id,
    title: body.title || "New Chat",
    messages: JSON.stringify(body.messages || []),
    model: body.model || null,
    system_prompt: body.systemPrompt || null,
    server_id: body.serverId || null,
    workspace_id: body.workspaceId || "default",
    topic_map: body.topicMap ? JSON.stringify(body.topicMap) : null,
  });

  return c.json({ _id: row.id, title: row.title }, 201);
});

// Update session
app.patch("/:id", async (c) => {
  const body = await c.req.json();
  const id = c.req.param("id");

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.messages !== undefined) updates.messages = JSON.stringify(body.messages);
  if (body.model !== undefined) updates.model = body.model;
  if (body.systemPrompt !== undefined) updates.system_prompt = body.systemPrompt;
  if (body.serverId !== undefined) updates.server_id = body.serverId;
  if (body.workspaceId !== undefined) updates.workspace_id = body.workspaceId;
  if (body.topicMap !== undefined) updates.topic_map = JSON.stringify(body.topicMap);

  const updated = updateRow("chat_sessions", id, updates);
  if (!updated) return c.json({ error: "Session not found" }, 404);
  return c.json({ _id: updated.id, title: updated.title });
});

// Delete session
app.delete("/:id", (c) => {
  if (!deleteRow("chat_sessions", c.req.param("id"))) {
    return c.json({ error: "Session not found" }, 404);
  }
  return c.json({ success: true });
});

// Append messages to a session
app.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const newMessages = body.messages as Array<unknown>;

  if (!Array.isArray(newMessages)) {
    return c.json({ error: "messages must be an array" }, 400);
  }

  const db = getDb();
  const existing = getRow<{ messages: string }>("chat_sessions", id);
  if (!existing) return c.json({ error: "Session not found" }, 404);

  const messages = [...JSON.parse(existing.messages), ...newMessages];
  updateRow("chat_sessions", id, { messages: JSON.stringify(messages) });

  return c.json({ success: true, messageCount: messages.length });
});

// Get topic map
app.get("/:id/topic-map", (c) => {
  const s = getRow<{ topic_map: string | null }>("chat_sessions", c.req.param("id"));
  if (!s) return c.json({ error: "Session not found" }, 404);
  return c.json(s.topic_map ? JSON.parse(s.topic_map) : {});
});

export default app;