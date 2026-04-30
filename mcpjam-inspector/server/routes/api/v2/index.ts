/**
 * V2 API routes — Local SQLite persistence layer.
 *
 * All routes are mounted under /api/v2 and only activate when
 * running in SQLite mode (no Convex backend configured).
 */

import { Hono } from "hono";
import { isSqliteMode } from "../../../db/connection";
import servers from "./servers";
import chatSessions from "./chat-sessions";
import workspaces from "./workspaces";
import sessionServers from "./session-servers";
import preferences from "./preferences";
import views from "./views";
import evals from "./evals";
import { toolsRoutes, resourcesRoutes, promptsRoutes } from "./mcp-cache";

const v2 = new Hono();

// Block all v2 routes if not in SQLite mode
v2.use("*", async (c, next) => {
  if (!isSqliteMode()) {
    return c.json(
      { error: "V2 API requires SQLite mode (set PERSISTENCE_MODE=sqlite or remove CONVEX_URL)" },
      400,
    );
  }
  await next();
});

// Health check
v2.get("/health", (c) =>
  c.json({ status: "ok", persistenceMode: "sqlite", timestamp: new Date().toISOString() }),
);

// Mount routes
v2.route("/servers", servers);
v2.route("/chat-sessions", chatSessions);
v2.route("/workspaces", workspaces);
v2.route("/session-servers", sessionServers);
v2.route("/preferences", preferences);
v2.route("/views", views);
v2.route("/evals", evals);
v2.route("/tools", toolsRoutes);
v2.route("/resources", resourcesRoutes);
v2.route("/prompts", promptsRoutes);

export default v2;