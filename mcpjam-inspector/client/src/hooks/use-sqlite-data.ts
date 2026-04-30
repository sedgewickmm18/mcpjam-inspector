/**
 * Dual-mode data hooks that transparently switch between Convex and SQLite.
 *
 * When running in SQLite mode, these hooks use the REST API client.
 * When running in Convex mode, they delegate to the existing Convex hooks.
 *
 * Components import from here instead of directly from Convex hooks,
 * allowing the persistence layer to be swapped without component changes.
 */

import { useState, useEffect, useCallback } from "react";
import { isSqliteMode } from "../lib/persistence-mode";
import * as sqliteApi from "../lib/sqlite-api";

// ─── Generic fetch hook ─────────────────────────────────────

function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: Error | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => {
    if (isSqliteMode()) {
      fetch();
    }
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ─── Servers ────────────────────────────────────────────────

export function useSqliteServers(workspaceId?: string) {
  return useFetch(() => sqliteApi.listServers(workspaceId), [workspaceId]);
}

export function useSqliteServerMutations() {
  const create = useCallback(
    async (data: Partial<sqliteApi.SqliteServer>) => sqliteApi.createServer(data),
    [],
  );
  const update = useCallback(
    async (id: string, data: Partial<sqliteApi.SqliteServer>) => sqliteApi.updateServer(id, data),
    [],
  );
  const remove = useCallback(async (id: string) => sqliteApi.deleteServer(id), []);
  return { create, update, remove };
}

// ─── Chat Sessions ──────────────────────────────────────────

export function useSqliteChatSessions(workspaceId?: string) {
  return useFetch(() => sqliteApi.listChatSessions(workspaceId), [workspaceId]);
}

export function useSqliteChatSession(id: string | null) {
  return useFetch(
    () => (id ? sqliteApi.getChatSession(id) : Promise.reject("No ID")),
    [id],
  );
}

export function useSqliteChatSessionMutations() {
  const create = useCallback(
    async (data: Partial<sqliteApi.SqliteChatSession>) => sqliteApi.createChatSession(data),
    [],
  );
  const update = useCallback(
    async (id: string, data: Partial<sqliteApi.SqliteChatSession>) => sqliteApi.updateChatSession(id, data),
    [],
  );
  const remove = useCallback(async (id: string) => sqliteApi.deleteChatSession(id), []);
  const appendMsgs = useCallback(
    async (id: string, messages: unknown[]) => sqliteApi.appendMessages(id, messages),
    [],
  );
  return { create, update, remove, appendMessages: appendMsgs };
}

// ─── Workspaces ─────────────────────────────────────────────

export function useSqliteWorkspaces() {
  return useFetch(() => sqliteApi.listWorkspaces());
}

export function useSqliteWorkspaceMutations() {
  const create = useCallback(
    async (data: Partial<sqliteApi.SqliteWorkspace>) => sqliteApi.createWorkspace(data),
    [],
  );
  const update = useCallback(
    async (id: string, data: Partial<sqliteApi.SqliteWorkspace>) => sqliteApi.updateWorkspace(id, data),
    [],
  );
  const remove = useCallback(async (id: string) => sqliteApi.deleteWorkspace(id), []);
  return { create, update, remove };
}

// ─── Views ──────────────────────────────────────────────────

export function useSqliteViews(workspaceId?: string) {
  return useFetch(() => sqliteApi.listViews(workspaceId), [workspaceId]);
}

export function useSqliteViewMutations() {
  const create = useCallback(
    async (data: Partial<sqliteApi.SqliteView>) => sqliteApi.createView(data),
    [],
  );
  const remove = useCallback(async (id: string) => sqliteApi.deleteView(id), []);
  return { create, remove };
}

// ─── Preferences ────────────────────────────────────────────

export function useSqlitePreferences() {
  return useFetch(() => sqliteApi.getPreferences());
}

export function useSqlitePreferenceMutations() {
  const update = useCallback(
    async (data: Partial<sqliteApi.SqlitePreferences>) => sqliteApi.updatePreferences(data),
    [],
  );
  return { update };
}