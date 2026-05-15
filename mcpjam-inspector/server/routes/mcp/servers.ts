import { Hono } from "hono";
import "../../types/hono"; // Type extensions
import { rpcLogBus, type RpcLogEvent } from "../../services/rpc-log-bus";
import { isSqliteMode } from "../../db/index.js";
import {
  listServers,
  type LocalServerConfig,
  unregisterServer,
} from "../../services/local-server-registry.js";
import { logger } from "../../utils/logger";
import {
  executeLocalServerConnect,
  parseLocalConnectRequestBody,
  respondWithLocalRouteError,
} from "../../utils/local-server-resolver.js";

const servers = new Hono();

// List all servers (connected in manager + all known in registry)
servers.get("/", async (c) => {
  try {
    const mcpClientManager = c.mcpClientManager;

    // Get servers currently connected in the manager
    const connectedServers = mcpClientManager
      .getServerSummaries()
      .map(({ id, status, config }) => ({
        id,
        name: id,
        status,
        config,
      }));

    // In local mode, also include all servers from the registry
    let serverList = connectedServers;
    if (isSqliteMode()) {
      const registryServers = listServers();

      // Add registry servers that aren't connected yet (disconnected after restart)
      const knownServerIds = new Set(connectedServers.map(s => s.id));

      const disconnectedServers = registryServers
        .filter(server => !knownServerIds.has(server.serverId))
        .map(server => {
          // Convert LocalServerConfig to MCPClientManager format
          const managerConfig: any = server.transportType === "stdio"
            ? {
                command: server.command,
                args: server.args || [],
                env: server.env || {},
              }
            : {
                url: server.url,
                requestInit: server.headers ? { headers: server.headers } : undefined,
              };

          return {
            id: server.serverId,
            name: server.name,
            status: "disconnected" as const,
            config: managerConfig,
          };
        });

      serverList = [...connectedServers, ...disconnectedServers];
    }

    return c.json({
      success: true,
      servers: serverList,
    });
  } catch (error) {
    logger.error("Error listing servers", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

servers.get("/status/:serverId", async (c) => {
  let serverId: string | undefined;
  try {
    serverId = c.req.param("serverId");
    const mcpClientManager = c.mcpClientManager;
    const connectionStatus = mcpClientManager.getConnectionStatus(serverId);
    const ping =
      connectionStatus === "connected"
        ? await mcpClientManager.pingServer(serverId)
        : null;

    return c.json({
      success: true,
      serverId,
      status: connectionStatus,
      ping,
    });
  } catch (error) {
    logger.error("Error getting server status", error, { serverId });
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Get initialization metadata for a server
servers.get("/init-info/:serverId", async (c) => {
  let serverId: string | undefined;
  try {
    serverId = c.req.param("serverId");
    const mcpClientManager = c.mcpClientManager;
    const initInfo = mcpClientManager.getInitializationInfo(serverId);

    if (!initInfo) {
      return c.json(
        {
          success: false,
          error: `Server "${serverId}" is not connected or initialization info not available`,
        },
        404,
      );
    }

    return c.json({
      success: true,
      serverId,
      initInfo,
    });
  } catch (error) {
    logger.error("Error getting initialization info", error, { serverId });
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Disconnect from a server
servers.delete("/:serverId", async (c) => {
  let serverId: string | undefined;
  try {
    serverId = c.req.param("serverId");
    const mcpClientManager = c.mcpClientManager;

    try {
      const client = mcpClientManager.getClient(serverId);
      if (client) {
        await mcpClientManager.disconnectServer(serverId);
      }
    } catch (error) {
      // Ignore disconnect errors for already disconnected servers
      logger.debug("Failed to disconnect MCP server during removal", {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    mcpClientManager.removeServer(serverId);

    // In SQLite mode, also remove from registry and database
    if (isSqliteMode()) {
      const unregistered = unregisterServer(serverId);
      if (unregistered) {
        logger.info(`[servers] Unregistered server from SQLite registry: ${serverId}`);
      }
    }

    return c.json({
      success: true,
      message: `Disconnected from server: ${serverId}`,
    });
  } catch (error) {
    logger.error("Error disconnecting server", error, { serverId });
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// List all known servers from the local registry (SQLite mode only).
// Returns servers from CLI config that are available for connection,
// even if they haven't been connected yet.
servers.get("/known", async (c) => {
  if (!isSqliteMode()) {
    return c.json(
      { success: false, error: "Only available in local mode" },
      400,
    );
  }
  const knownServers = listServers();
  return c.json({ success: true, servers: knownServers });
});

// Reconnect to a server. Body shape: {projectId, serverId, serverName};
// local Hono server resolves the config (and any OAuth tokens) from Convex
// via /web/authorize-batch-local.
servers.post("/reconnect", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json(
      {
        success: false,
        error: "Failed to parse request body",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      400,
    );
  }

  const parsed = parseLocalConnectRequestBody(c, body);
  if (!parsed.ok) {
    return respondWithLocalRouteError(c, parsed.error);
  }

  // Reconnect leaves the manager entry in place on failure — the caller
  // intends to retry, and removing it would also drop any in-flight
  // streams (tools/RPC) that pointed at this name.
  return executeLocalServerConnect(c, parsed.params, {
    removeOnFailure: false,
  });
});

// Stream JSON-RPC messages over SSE for all servers.
servers.get("/rpc/stream", async (c) => {
  const serverIds = c.mcpClientManager.listServers();
  const url = new URL(c.req.url);
  const replay = parseInt(url.searchParams.get("replay") || "0", 10);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {}
      };

      // Replay recent messages for all known servers
      try {
        const recent = rpcLogBus.getBuffer(
          serverIds,
          isNaN(replay) ? 0 : replay,
        );
        for (const evt of recent) {
          send({ type: "rpc", ...evt });
        }
      } catch {}

      // Subscribe to live events for all known servers
      const unsubscribe = rpcLogBus.subscribe(serverIds, (evt: RpcLogEvent) => {
        send({ type: "rpc", ...evt });
      });

      // Keepalive comments
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {}
      }, 15000);

      // Cleanup on client disconnect
      c.req.raw.signal.addEventListener("abort", () => {
        try {
          clearInterval(keepalive);
          unsubscribe();
        } catch {}
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "*",
    },
  });
});

export default servers;