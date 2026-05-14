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
  }

  logger.info(`[local-registry] Initialized with ${registry.size} server(s)`);
}

/**
 * Register a new server (e.g., when frontend adds one).
 */
export function registerServer(config: LocalServerConfig): void {
  registry.set(config.serverId, config);
  logger.info(`[local-registry] Registered server: ${config.serverId} (${config.transportType})`);
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