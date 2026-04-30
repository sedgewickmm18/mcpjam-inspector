/**
 * Persistence mode detection and configuration.
 *
 * The server injects `window.__MCP_RUNTIME_CONFIG__` with a `persistenceMode`
 * field that tells the client whether to use Convex (cloud) or SQLite (local)
 * for data persistence.
 */

export type PersistenceMode = "convex" | "sqlite";

export interface RuntimePersistenceConfig {
  convexUrl?: string;
  convexSiteUrl?: string;
  persistenceMode: PersistenceMode;
}

/**
 * Get the runtime persistence config injected by the server.
 */
export function getRuntimePersistenceConfig(): RuntimePersistenceConfig {
  const config = (window as any).__MCP_RUNTIME_CONFIG__ as
    | RuntimePersistenceConfig
    | undefined;
  return config ?? { persistenceMode: "convex" };
}

/**
 * Check if the app is running in local SQLite mode.
 */
export function isSqliteMode(): boolean {
  return getRuntimePersistenceConfig().persistenceMode === "sqlite";
}