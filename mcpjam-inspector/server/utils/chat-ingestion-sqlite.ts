/**
 * SQLite-backed chat session persistence.
 *
 * Mirrors the shape of `persistChatSessionToConvex` but writes directly
 * to the local SQLite database instead of calling a Convex HTTP endpoint.
 * Used when the server runs in local / offline mode (no Convex backend).
 */

import { logger } from "./logger";
import { isSqliteMode, getDb } from "../db/connection";
import { getRow, updateRow, insertRow, generateId } from "../db/crud";
import type { PersistedTurnTrace } from "./chat-ingestion";

interface ResumeConfig {
  systemPrompt?: string;
  temperature?: number;
  requireToolApproval?: boolean;
  selectedServers?: string[];
}

interface PersistChatSessionSqliteOptions {
  chatSessionId: string;
  modelId: string;
  modelSource: "mcpjam" | "byok";
  workspaceId?: string;
  sourceType?: "serverShare" | "chatbox" | "direct";
  sessionMessages?: unknown[];
  systemPrompt?: string;
  startedAt: number;
  lastActivityAt?: number;
  resumeConfig?: ResumeConfig;
  turnTrace?: PersistedTurnTrace;
}

/**
 * Persist a completed chat turn to SQLite.
 *
 * If a chat session row already exists (by id), it is updated with the
 * new message list and metadata. If it does not exist, a new row is created.
 */
export async function persistChatSessionToSqlite(
  options: PersistChatSessionSqliteOptions,
): Promise<void> {
  if (!isSqliteMode()) return;

  try {
    const db = getDb();
    const existing = getRow<{ id: string; messages: string }>(
      "chat_sessions",
      options.chatSessionId,
    );

    const messages = options.sessionMessages ?? [];
    const messagesJson = JSON.stringify(messages);

    if (existing) {
      // Update existing session
      const updates: Record<string, unknown> = {
        messages: messagesJson,
        model: options.modelId,
      };

      if (options.systemPrompt !== undefined) {
        updates.system_prompt = options.systemPrompt;
      }

      if (options.workspaceId !== undefined) {
        updates.workspace_id = options.workspaceId;
      }

      updateRow("chat_sessions", options.chatSessionId, updates);
    } else {
      // Create new session
      insertRow("chat_sessions", {
        id: options.chatSessionId,
        title: `Chat ${new Date().toLocaleString()}`,
        messages: messagesJson,
        model: options.modelId,
        system_prompt: options.systemPrompt || null,
        server_id: null,
        workspace_id: options.workspaceId || "default",
        topic_map: null,
      });
    }

    logger.info(
      `[chat-session-sqlite] Persisted session ${options.chatSessionId} (${messages.length} messages)`,
    );
  } catch (error) {
    logger.warn("[chat-session-sqlite] Error persisting chat session", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Check whether SQLite persistence should be used instead of Convex.
 */
export function shouldUseSqlitePersistence(): boolean {
  return isSqliteMode();
}