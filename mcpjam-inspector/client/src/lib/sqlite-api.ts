/**
 * SQLite REST API client for local persistence mode.
 *
 * Provides typed fetch wrappers for the /api/v2/* endpoints that replace
 * Convex queries/mutations when running without a Convex backend.
 */

import { isSqliteMode } from "./persistence-mode";

const API_BASE = "/api/v2";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ─── Servers ────────────────────────────────────────────────

export interface SqliteServer {
  _id: string;
  name: string;
  transportType: string;
  config: Record<string, unknown>;
  workspaceId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function listServers(workspaceId?: string): Promise<SqliteServer[]> {
  const query = workspaceId ? `?workspaceId=${workspaceId}` : "";
  return request<SqliteServer[]>(`/servers${query}`);
}

export async function getServer(id: string): Promise<SqliteServer> {
  return request<SqliteServer>(`/servers/${id}`);
}

export async function createServer(data: Partial<SqliteServer>): Promise<SqliteServer> {
  return request<SqliteServer>("/servers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateServer(id: string, data: Partial<SqliteServer>): Promise<SqliteServer> {
  return request<SqliteServer>(`/servers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteServer(id: string): Promise<void> {
  await request<void>(`/servers/${id}`, { method: "DELETE" });
}

// ─── Chat Sessions ──────────────────────────────────────────

export interface SqliteChatSession {
  _id: string;
  title: string | null;
  messages?: unknown[];
  model: string | null;
  systemPrompt: string | null;
  serverId: string | null;
  workspaceId: string | null;
  topicMap?: unknown;
  messageCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export async function listChatSessions(workspaceId?: string): Promise<SqliteChatSession[]> {
  const query = workspaceId ? `?workspaceId=${workspaceId}` : "";
  return request<SqliteChatSession[]>(`/chat-sessions${query}`);
}

export async function getChatSession(id: string): Promise<SqliteChatSession> {
  return request<SqliteChatSession>(`/chat-sessions/${id}`);
}

export async function createChatSession(data: Partial<SqliteChatSession>): Promise<{ _id: string; title: string }> {
  return request(`/chat-sessions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateChatSession(id: string, data: Partial<SqliteChatSession>): Promise<{ _id: string }> {
  return request(`/chat-sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteChatSession(id: string): Promise<void> {
  await request(`/chat-sessions/${id}`, { method: "DELETE" });
}

export async function appendMessages(id: string, messages: unknown[]): Promise<{ success: boolean; messageCount: number }> {
  return request(`/chat-sessions/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

// ─── Workspaces ─────────────────────────────────────────────

export interface SqliteWorkspace {
  _id: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export async function listWorkspaces(): Promise<SqliteWorkspace[]> {
  return request<SqliteWorkspace[]>("/workspaces");
}

export async function createWorkspace(data: Partial<SqliteWorkspace>): Promise<{ _id: string }> {
  return request("/workspaces", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateWorkspace(id: string, data: Partial<SqliteWorkspace>): Promise<{ _id: string }> {
  return request(`/workspaces/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  await request(`/workspaces/${id}`, { method: "DELETE" });
}

// ─── Views ──────────────────────────────────────────────────

export interface SqliteView {
  _id: string;
  workspaceId: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export async function listViews(workspaceId?: string): Promise<SqliteView[]> {
  const query = workspaceId ? `?workspaceId=${workspaceId}` : "";
  return request<SqliteView[]>(`/views${query}`);
}

export async function createView(data: Partial<SqliteView>): Promise<{ _id: string }> {
  return request("/views", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteView(id: string): Promise<void> {
  await request(`/views/${id}`, { method: "DELETE" });
}

// ─── Preferences ────────────────────────────────────────────

export interface SqlitePreferences {
  name: string;
  email: string | null;
  preferences: Record<string, unknown>;
}

export async function getPreferences(): Promise<SqlitePreferences> {
  return request<SqlitePreferences>("/preferences");
}

export async function updatePreferences(data: Partial<SqlitePreferences>): Promise<SqlitePreferences> {
  return request<SqlitePreferences>("/preferences", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}