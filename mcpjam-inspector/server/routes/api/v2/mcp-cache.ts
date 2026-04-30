/**
 * CRUD routes for cached MCP entities (tools, resources, prompts).
 * All are scoped by serverId.
 */

import { Hono } from "hono";
import { isSqliteMode } from "../../../db/connection";
import { generateId, listRows, getRow, insertRow, updateRow, deleteRow, parseJsonColumn } from "../../../db/crud";

function createCacheRoutes(table: string, jsonColumns: string[]) {
  const app = new Hono();

  // List by server
  app.get("/", (c) => {
    if (!isSqliteMode()) return c.json({ error: "SQLite mode not active" }, 400);
    const serverId = c.req.query("serverId");
    const rows = listRows<{ id: string; server_id: string; name: string; description: string | null; [k: string]: unknown }>(
      table,
      serverId ? { where: "server_id = ?", whereArgs: [serverId] } : undefined,
    );
    return c.json(rows.map((r) => {
      const result: Record<string, unknown> = { _id: r.id, serverId: r.server_id, name: r.name, description: r.description };
      for (const col of jsonColumns) {
        result[col] = parseJsonColumn(r[col] as string | null);
      }
      return result;
    }));
  });

  // Get single
  app.get("/:id", (c) => {
    const r = getRow<{ id: string; server_id: string; name: string; description: string | null; [k: string]: unknown }>(table, c.req.param("id"));
    if (!r) return c.json({ error: "Not found" }, 404);
    const result: Record<string, unknown> = { _id: r.id, serverId: r.server_id, name: r.name, description: r.description };
    for (const col of jsonColumns) {
      result[col] = parseJsonColumn(r[col] as string | null);
    }
    return c.json(result);
  });

  // Create
  app.post("/", async (c) => {
    const body = await c.req.json();
    const id = generateId();
    const data: Record<string, unknown> = { id, server_id: body.serverId, name: body.name, description: body.description || null };
    for (const col of jsonColumns) {
      data[col] = body[col] !== undefined ? JSON.stringify(body[col]) : null;
    }
    insertRow(table, data);
    return c.json({ _id: id }, 201);
  });

  // Update
  app.patch("/:id", async (c) => {
    const body = await c.req.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    for (const col of jsonColumns) {
      if (body[col] !== undefined) updates[col] = JSON.stringify(body[col]);
    }
    const updated = updateRow(table, c.req.param("id"), updates);
    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json({ _id: updated.id });
  });

  // Delete
  app.delete("/:id", (c) => {
    if (!deleteRow(table, c.req.param("id"))) return c.json({ error: "Not found" }, 404);
    return c.json({ success: true });
  });

  // Bulk replace for a server (delete all + insert)
  app.post("/bulk-replace", async (c) => {
    const body = await c.req.json();
    const { serverId, items } = body;
    if (!serverId || !Array.isArray(items)) return c.json({ error: "serverId and items[] required" }, 400);

    const { getDb } = await import("../../../db/connection");
    const db = getDb();
    const bulkReplace = db.transaction(() => {
      db.prepare(`DELETE FROM ${table} WHERE server_id = ?`).run(serverId);
      const insert = db.prepare(
        `INSERT INTO ${table} (id, server_id, name, description${jsonColumns.map((c) => `, ${c}`).join("")}) VALUES (?, ?, ?${jsonColumns.map(() => ", ?").join("")})`,
      );
      for (const item of items) {
        const id = generateId();
        const values: unknown[] = [id, serverId, item.name || "", item.description || null];
        for (const col of jsonColumns) {
          values.push(item[col] !== undefined ? JSON.stringify(item[col]) : null);
        }
        insert.run(...values);
      }
    });
    bulkReplace();
    return c.json({ success: true, count: items.length });
  });

  return app;
}

export const toolsRoutes = createCacheRoutes("tools", ["input_schema"]);
export const resourcesRoutes = createCacheRoutes("resources", []);
export const promptsRoutes = createCacheRoutes("prompts", ["arguments"]);