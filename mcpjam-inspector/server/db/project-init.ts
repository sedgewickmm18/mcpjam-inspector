import { getDb } from "./connection";

const DEFAULT_PROJECT_ID = "local-default";
const DEFAULT_PROJECT_NAME = "My Project";

/**
 * Ensures a default project exists in the workspaces table.
 * If the table is empty, creates a default project.
 * If a default project already exists, returns its ID.
 * If other projects exist but no default, returns the first project's ID.
 *
 * @returns The project ID to use as default
 */
export async function ensureDefaultProject(): Promise<string> {
  const db = getDb();

  // Check if any projects exist
  const existingProjects = db
    .prepare("SELECT id, name FROM workspaces ORDER BY created_at ASC")
    .all() as Array<{ id: string; name: string }>;

  if (existingProjects.length === 0) {
    // Table is empty - create default project
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)`
    ).run(DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME, now);
    console.log(
      `[project-init] Created default project: ${DEFAULT_PROJECT_ID} ("${DEFAULT_PROJECT_NAME}")`
    );
    return DEFAULT_PROJECT_ID;
  }

  // Check if our default project ID already exists
  const hasDefaultProject = existingProjects.some(
    (p) => p.id === DEFAULT_PROJECT_ID
  );

  if (hasDefaultProject) {
    console.log(
      `[project-init] Default project already exists: ${DEFAULT_PROJECT_ID}`
    );
    return DEFAULT_PROJECT_ID;
  }

  // Default doesn't exist but other projects do - return the first one
  const firstProject = existingProjects[0];
  console.log(
    `[project-init] Default project not found, using first existing project: ${firstProject.id} ("${firstProject.name}")`
  );
  return firstProject.id;
}

/**
 * Gets the ID of the default project.
 * This is a synchronous wrapper around ensureDefaultProject for use in request handlers.
 * Note: This should only be called after the server has initialized and ensureDefaultProject has run.
 *
 * @returns The default project ID
 * @throws If the default project doesn't exist
 */
export function getDefaultProjectId(): string {
  const db = getDb();
  const project = db
    .prepare("SELECT id FROM workspaces WHERE id = ? LIMIT 1")
    .get(DEFAULT_PROJECT_ID) as { id: string } | undefined;

  if (!project) {
    // If default doesn't exist, try to get any project
    const anyProject = db
      .prepare("SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1")
      .get() as { id: string } | undefined;

    if (anyProject) {
      console.warn(
        `[project-init] Default project "${DEFAULT_PROJECT_ID}" not found, using: ${anyProject.id}`
      );
      return anyProject.id;
    }

    throw new Error(
      "No project found in database. Call ensureDefaultProject() during server startup."
    );
  }

  return project.id;
}

/**
 * Checks if we're in SQLite mode (as opposed to Convex mode).
 * This helps determine if project initialization is needed.
 */
export function isSqliteMode(): boolean {
  return process.env.CONVEX_URL === undefined &&
    process.env.VITE_CONVEX_URL === undefined;
}