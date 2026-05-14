import { Hono } from "hono";
import { z } from "zod";
import {
  listRows,
  getRow,
  insertRow,
  updateRow,
  deleteRow,
} from "../../db/crud";
import { parseWithSchema } from "../web/errors";

const projectsRouter = new Hono();

// Schema definitions
const createProjectSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(255),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255),
});

/**
 * GET /api/mcp/projects
 * List all projects
 */
projectsRouter.get("/", async (c) => {
  const projects = listRows("workspaces", {
    orderBy: "created_at ASC",
  });
  return c.json({ projects });
});

/**
 * GET /api/mcp/projects/:id
 * Get a single project by ID
 */
projectsRouter.get("/:id", async (c) => {
  const projectId = c.req.param("id");

  if (!projectId || projectId.length === 0) {
    return c.json({ error: "Invalid project ID" }, 400);
  }

  const project = getRow("workspaces", projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json({ project });
});

/**
 * POST /api/mcp/projects
 * Create a new project
 */
projectsRouter.post("/", async (c) => {
  const body = await c.req.json();
  
  try {
    const data = parseWithSchema(createProjectSchema, body);

    // If ID not provided, generate one
    const projectId = data.id || `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Check if project already exists
    const existing = getRow("workspaces", projectId);
    if (existing) {
      return c.json({ error: "Project with this ID already exists" }, 409);
    }

    const project = insertRow("workspaces", {
      id: projectId,
      name: data.name,
      created_at: new Date().toISOString(),
    });

    return c.json({ project }, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 400);
  }
});

/**
 * PATCH /api/mcp/projects/:id
 * Update a project's name
 */
projectsRouter.patch("/:id", async (c) => {
  const projectId = c.req.param("id");

  if (!projectId || projectId.length === 0) {
    return c.json({ error: "Invalid project ID" }, 400);
  }

  const body = await c.req.json();

  try {
    const data = parseWithSchema(updateProjectSchema, body);

    // Check if project exists
    const existing = getRow("workspaces", projectId);
    if (!existing) {
      return c.json({ error: "Project not found" }, 404);
    }

    const project = updateRow("workspaces", projectId, {
      name: data.name,
    });

    return c.json({ project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 400);
  }
});

/**
 * DELETE /api/mcp/projects/:id
 * Delete a project
 * Note: This will cascade delete all associated data (servers, etc.)
 * if foreign key constraints are properly set up in SQLite.
 */
projectsRouter.delete("/:id", async (c) => {
  const projectId = c.req.param("id");

  if (!projectId || projectId.length === 0) {
    return c.json({ error: "Invalid project ID" }, 400);
  }

  // Check if project exists
  const existing = getRow("workspaces", projectId);
  if (!existing) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Prevent deleting the default project
  if (projectId === "local-default") {
    return c.json({ error: "Cannot delete the default project" }, 400);
  }

  deleteRow("workspaces", projectId);

  return c.json({ success: true });
});

export default projectsRouter;