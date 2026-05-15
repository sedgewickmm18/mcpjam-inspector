/**
 * Local Server Registry
 *
 * In-memory registry of MCP server configs for local/SQLite mode.
 * Replaces Convex as the source of server configs for connect/reconnect.
 *
 * Populated from CLI config (MCP_CONFIG_DATA env var) on startup.
 * Future: can be extended with SQLite persistence.
 */

import { logger } from "../utils/logger";
import type { Database } from "better-sqlite3";
import { getDb } from "../db/connection";

export interface LocalServerConfig {
  serverId: string;
  name: string;
  transportType: "stdio" | "http";
  // stdio fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http fields
  url?: string;
  headers?: Record<string, string>;
  useOAuth?: boolean;
  // general
  timeout?: number;
}

/**
 * The authorize-batch-local response expects a specific server config shape.
 * This is the format that Convex returns and the rest of the code expects.
 */
interface AuthServerConfig {
  transportType: "stdio" | "http";
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http
  url?: string;
  headers?: Record<string, string>;
  useOAuth?: boolean;
  // general
  timeout?: number;
  clientCapabilities?: unknown;
}

// In-memory store: serverId → config
const registry = new Map<string, LocalServerConfig>();

/**
 * Initialize the registry from CLI config data.
 * Called once on server startup.
 */
export function initFromCLIConfig(config: {
  servers?: Array<{
    name: string;
    type?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    useOAuth?: boolean;
  }>;
}): void {
  if (!config.servers || config.servers.length === 0) {
    logger.info("[local-registry] No CLI servers to register");
    return;
  }

  for (const server of config.servers) {
    const transportType = (server.type || (server.url ? "http" : "stdio")) as
      | "stdio"
      | "http";

    const entry: LocalServerConfig = {
      serverId: server.name,
      name: server.name,
      transportType,
      ...(transportType === "stdio"
        ? {
            command: server.command,
            args: server.args || [],
            env: server.env || {},
          }
        : {}),
      ...(transportType === "http"
        ? {
            url: server.url,
            headers: server.headers,
            useOAuth: server.useOAuth,
          }
        : {}),
    };

    registry.set(server.name, entry);
    logger.info(`[local-registry] Registered CLI server: ${server.name} (${transportType})`);
    // Also save to SQLite
    saveServerToSQLite(entry);
  }

  logger.info(`[local-registry] Initialized with ${registry.size} server(s)`);
}

/**
 * Register a new server (e.g., when frontend adds one).
 */
export function registerServer(config: LocalServerConfig): void {
  registry.set(config.serverId, config);
  logger.info(`[local-registry] Registered server: ${config.serverId} (${config.transportType})`);
  // Save to SQLite
  saveServerToSQLite(config);
}

/**
 * Get server config by ID (name).
 */
export function getServerConfig(
  serverId: string,
): LocalServerConfig | undefined {
  return registry.get(serverId);
}

/**
 * List all known servers.
 */
export function listServers(): LocalServerConfig[] {
  return Array.from(registry.values());
}

/**
 * Load servers from SQLite database.
 * Reads all rows from the servers table and populates the registry.
 */
export function loadServersFromSQLite(): void {
  const db = getDb();
  // Type-safe query result - cast to typed array
  const rows = db.prepare(`SELECT * FROM servers`).all() as Array<{
    id: string;
    name: string;
    transport_type: "stdio" | "http";
    config: string;
  }>;
  for (const row of rows) {
    try {
      // Parse JSON config
      const configJson = JSON.parse(row.config) as {
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        url?: string;
        headers?: Record<string, string>;
        useOAuth?: boolean;
        timeout?: number;
      };
      const config: LocalServerConfig = {
        serverId: row.id,
        name: row.name,
        transportType: row.transport_type,
        ...(row.transport_type === "stdio" ? {
          command: configJson.command,
          args: configJson.args,
          env: configJson.env,
        } : {}),
        ...(row.transport_type === "http" ? {
          url: configJson.url,
          headers: configJson.headers,
          useOAuth: configJson.useOAuth,
        } : {}),
        timeout: configJson.timeout,
      };
      registry.set(row.id, config);
      logger.info(`[local-registry] Loaded server from SQLite: ${row.id}`);
    } catch (e) {
      logger.error(`Failed to load server from SQLite: ${row.id}`, e);
    }
  }
}

/**
 * Save a server configuration to SQLite database.
 * Inserts a new row or updates an existing one.
 */
export function saveServerToSQLite(config: LocalServerConfig): void {
  const db = getDb();
  const existing = db.prepare(`SELECT 1 FROM servers WHERE id = ?`).get(config.serverId);

  const serverData = {
    id: config.serverId,
    name: config.name,
    transport_type: config.transportType,
    config: {
      ...(config.transportType === "stdio" ? {
        command: config.command,
        args: config.args,
        env: config.env,
      } : {}),
      ...(config.transportType === "http" ? {
        url: config.url,
        headers: config.headers,
        useOAuth: config.useOAuth,
      } : {}),
      timeout: config.timeout,
    },
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const sql = `UPDATE servers SET name = ?, transport_type = ?, config = ?, updated_at = ? WHERE id = ?`;
    db.prepare(sql).run(
      serverData.name,
      serverData.transport_type,
      JSON.stringify(serverData.config),
      serverData.updated_at,
      serverData.id
    );
  } else {
    const sql = `INSERT INTO servers (id, name, transport_type, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`;
    db.prepare(sql).run(
      serverData.id,
      serverData.name,
      serverData.transport_type,
      JSON.stringify(serverData.config),
      serverData.updated_at,
      serverData.updated_at
    );
  }
}

/**
 * Remove a server from the registry.
 */
export function removeServer(serverId: string): boolean {
  const existed = registry.delete(serverId);
  if (existed) {
    logger.info(`[local-registry] Removed server: ${serverId}`);
  }
  return existed;
}

/**
 * Check if a server is known.
 */
export function hasServer(serverId: string): boolean {
  return registry.has(serverId);
}

/**
 * Convert a LocalServerConfig to the authorize-batch-local response format.
 * This is what Convex would normally return and what the rest of the code expects.
 */
export function configToAuthFormat(
  config: LocalServerConfig,
): AuthServerConfig {
  const result: AuthServerConfig = {
    transportType: config.transportType,
    timeout: config.timeout,
  };

  if (config.transportType === "stdio") {
    result.command = config.command;
    result.args = config.args || [];
    result.env = config.env || {};
  } else {
    result.url = config.url;
    result.headers = config.headers || {};
    result.useOAuth = config.useOAuth;
  }

  return result;
}