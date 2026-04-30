# Strategy B: Replacing Convex with Embedded SQLite

## Document Status: Implementation In Progress

**Date**: 2026-04-29 (updated 2026-04-30)  
**Author**: Analysis of MCPJam Inspector persistence layer  
**Target**: Replace cloud-hosted Convex database with embedded SQLite for local/self-hosted deployments  

### Implementation Progress

| Phase | Status | Files Created |
|---|---|---|
| Phase 1: SQLite Foundation | ✅ Complete | `server/db/{connection,schema,migrations,seed,crud,index}.ts` |
| Phase 2: Core REST API | ✅ Complete | `server/routes/api/v2/{index,servers,chat-sessions,workspaces,mcp-cache,session-servers,preferences,views,evals}.ts` |
| Phase 3: LLM Direct Streaming | ✅ Complete | `server/utils/chat-ingestion-sqlite.ts`, unified dispatcher in `chat-ingestion.ts` |
| Phase 4: Client Data Provider | ✅ Complete | `client/src/lib/{persistence-mode,sqlite-api}.ts`, `client/src/hooks/use-sqlite-data.ts` |
| Phase 5: Auth Simplification | ✅ Complete | Gated in `convex-guest-auth-sync.ts`, `server/env.ts` |
| Phase 6: Component Integration | 🔲 Remaining | Individual component migration to use dual-mode hooks |

---

## 1. Motivation

MCPJam Inspector currently relies on **Convex** (a cloud-hosted serverless database) for all persistent storage. This creates several issues for local and self-hosted deployments:

- **Cloud dependency**: Requires a Convex account and internet connectivity
- **Latency**: Every persistence operation rounds through Convex's cloud API
- **Data sovereignty**: User data (server configs, chat history, eval results) stored on Convex servers
- **Deployment complexity**: Separate `mcpjam-backend` repo needed for Convex function deployment
- **Cost**: Convex pricing tiers for production use

The goal is to replace Convex with an **embedded SQLite database** (`better-sqlite3`) that ships with the Inspector, requiring zero external services.

---

## 2. Current Architecture (Convex)

### 2.1 Three Roles Convex Plays

Convex is not merely a database — it serves three distinct roles in the current architecture:

| Role | Description | Coupling Level |
|---|---|---|
| **Database** | CRUD for ~15 entity types via reactive queries and mutations | High — 70+ direct hook calls in ~50 components |
| **Real-time subscriptions** | Live query updates pushed via WebSocket to React hooks | High — Convex React hooks provide automatic reactivity |
| **LLM proxy** | `/stream` HTTP endpoint proxies OpenRouter API calls, protecting the API key | Medium — 3 server files call Convex HTTP endpoints |

### 2.2 Data Flow Diagram (Current)

```
┌──────────────┐  useQuery/useMutation   ┌──────────────┐
│   React      │ ──────────────────────► │   Convex     │
│   Client     │ ◄────────────────────── │   Cloud DB   │
│              │  (WebSocket reactive)   │              │
└──────┬───────┘                         └──────┬───────┘
       │                                        │
       │ fetch(/api/...)                         │ fetch(/stream, /ingest-chat)
       ▼                                        │
┌──────────────┐                                │
│  Hono Server │ ───────────────────────────────┘
│  (6274)      │
│              │◄──── MCP JSON-RPC ────► MCP Servers
└──────────────┘
```

### 2.3 Entity Inventory

The following entities are persisted in Convex. Each requires a corresponding SQLite table and REST API endpoint.

#### Core Entities (Required for Local Mode)

| Entity | Purpose | Key Fields | Estimated Size |
|---|---|---|---|
| `servers` | MCP server connection configs | name, transportType, config (JSON) | Small (10s per user) |
| `chatSessions` | Chat history with LLMs | title, messages (JSON), model, serverId | Medium (100s, messages are large) |
| `workspaces` | Logical groupings of servers | name, settings (JSON) | Small (1-5 per user) |
| `tools` | Cached MCP tool definitions | serverId, name, description, inputSchema (JSON) | Small (cache) |
| `resources` | Cached MCP resource metadata | serverId, uri, name, description | Small (cache) |
| `prompts` | Cached MCP prompt definitions | serverId, name, description, arguments (JSON) | Small (cache) |
| `testSuites` | Evaluation test suite containers | name, serverId, config (JSON) | Small |
| `testCases` | Individual test cases within suites | suiteId, name, input (JSON), expectedOutput (JSON) | Medium |
| `testIterations` | Test execution results | testCaseId, status, actualOutput (JSON), durationMs | Can grow large |
| `users` | User preferences (local profile) | name, email, preferences (JSON) | Single record |
| `views` | Custom data views per workspace | workspaceId, type, config (JSON) | Small |
| `inspectorSessionServers` | Session-to-server mappings | sessionId, serverId, config (JSON) | Ephemeral |

#### Hosted-Only Entities (Skip for Local Mode)

| Entity | Purpose | Why Skip for Local |
|---|---|---|
| `serverShares` | Sharing servers with others | Multi-user feature |
| `workspaceSlackIntegrations` | Slack notifications | Cloud integration |
| `billing` / `organizations` | Billing management | SaaS feature |
| `registry` | Public server directory | Cloud service |
| `oauthApps` | OAuth app management | Cloud service |
| `contacts` | Contact form submissions | Cloud service |
| `chatboxes` | Chatbox configurations | Hosted feature |
| `apiKeys` | API key management | Can be simplified for local |

### 2.4 Convex Function Call Inventory

Complete list of all Convex function references in the current codebase:

#### Client-Side Queries (`useQuery`)

| Function | File(s) Using It | Args |
|---|---|---|
| `api.servers.list` | `servers-table.tsx` | `{}` |
| `api.servers.get` | `server-config.tsx` | `{ serverId }` |
| `api.servers.getWorkspaceServers` | `useViews.ts` | `{ workspaceId }` |
| `api.inspector.getSessionServers` | `inspect-page.tsx`, `servers-table.tsx` | `{ sessionId }` |
| `api.chatSessions.list` | `ChatTabV2.tsx` | `{}` |
| `api.chatSessions.get` | `ChatTabV2.tsx` | `{ sessionId }` |
| `api.chatSessions.getTopicMapSnapshot` | `useChatboxTopicMap.ts` | `{ sessionId }` |
| `api.tools.listByServer` | `server-config.tsx` | `{ serverId }` |
| `api.tools.get` | `tool-card.tsx`, `tool-execution.tsx` | `{ toolId }` |
| `api.resources.listByServer` | `server-config.tsx` | `{ serverId }` |
| `api.resources.get` | `resource-card.tsx` | `{ resourceId }` |
| `api.prompts.listByServer` | `server-config.tsx` | `{ serverId }` |
| `api.prompts.get` | `prompt-card.tsx` | `{ promptId }` |
| `api.workspaces.list` | `use-workspaces.ts` | `{}` |
| `api.workspaces.get` | `use-workspaces.ts` | `{ workspaceId }` |
| `api.testSuites.list` | `EvalsTab.tsx`, `CiEvalsTab.tsx` | `{}` |
| `api.testSuites.get` | `EvalsTab.tsx` | `{ suiteId }` |
| `api.testCases.listTestCases` | `EvalsTab.tsx`, `generate-and-persist-tests.ts` | `{ suiteId }` |
| `api.testIterations.list` | eval routes | `{ testCaseId }` |
| `api.evals.getStatus` | eval routes | `{ evalId }` |
| `api.users.getCurrentUser` | `sidebar-user.tsx` | `{}` |
| `api.apiKeys.list` | `AccountApiKeySection.tsx` | `{}` |
| `api.views.listAllByWorkspace` | `useViews.ts` | `{ workspaceId }` |
| `api.serverShares.resolveShareForViewer` | `SharedServerChatPage.tsx` | `{ shareId }` |
| `api.serverShares.getServerShareSettings` | `useServerShares.ts` | `{ serverId }` |
| `api.workspaceSlackIntegrations.getStatus` | `useWorkspaceSlackIntegration.ts` | `{ workspaceId }` |

#### Client-Side Mutations (`useMutation`)

| Function | File(s) Using It | Args |
|---|---|---|
| `api.servers.createServer` | `useViews.ts` | `{ name, config, ... }` |
| `api.servers.update` | `server-config.tsx` | `{ serverId, ... }` |
| `api.servers.delete` | `server-config.tsx` | `{ serverId }` |
| `api.inspector.createOrUpdateSessionServer` | `server-config.tsx` | `{ sessionId, serverId, ... }` |
| `api.inspector.removeSessionServer` | `server-config.tsx` | `{ sessionId, serverId }` |
| `api.chatSessions.create` | `use-chat-session.ts` | `{ title, model, ... }` |
| `api.chatSessions.delete` | `ChatTabV2.tsx` | `{ sessionId }` |
| `api.tools.create/update/delete` | `tool-card.tsx` | various |
| `api.resources.create/update/delete` | `resource-card.tsx` | various |
| `api.prompts.create/update/delete` | `prompt-card.tsx` | various |
| `api.workspaces.create/update/delete` | `use-workspaces.ts` | various |
| `api.testSuites.create/update/delete` | `EvalsTab.tsx` | various |
| `api.testCases.create/update/delete` | `EvalsTab.tsx` | various |
| `api.testIterations.create` | eval routes | `{ testCaseId, status, output, ... }` |
| `api.evals.create` | evals-runner | `{ ... }` |
| `api.users.update` | settings | `{ ... }` |
| `api.apiKeys.regenerateAndGet` | `AccountApiKeySection.tsx` | `{}` |
| `api.mcpAppViews.create/update/remove` | `useViews.ts` | various |
| `api.mcpAppViews.generateUploadUrl` | `useViews.ts` | `{}` |
| `api.openaiAppViews.create/update/remove` | `useViews.ts` | various |
| `api.serverShares.ensureServerShare` | `useServerShares.ts` | `{ serverId }` |
| `api.serverShares.setServerShareMode` | `useServerShares.ts` | `{ ... }` |
| `api.serverShares.rotateServerShareLink` | `useServerShares.ts` | `{ serverId }` |
| `api.serverShares.upsertServerShareMember` | `useServerShares.ts` | `{ ... }` |
| `api.serverShares.removeServerShareMember` | `useServerShares.ts` | `{ ... }` |
| `api.workspaceSlackIntegrations.connectIncomingWebhook` | `useWorkspaceSlackIntegration.ts` | `{ url }` |
| `api.workspaceSlackIntegrations.disconnect` | `useWorkspaceSlackIntegration.ts` | `{}` |
| `api.workspaceSlackIntegrations.sendTestMessage` | `useWorkspaceSlackIntegration.ts` | `{}` |

#### Server-Side HTTP Calls

| Endpoint | Method | Caller | Purpose |
|---|---|---|---|
| `${CONVEX_HTTP_URL}/stream` | POST | `mcpjam-stream-handler.ts` | LLM streaming proxy (mode: "stream") |
| `${CONVEX_HTTP_URL}/stream` | POST | `evals-runner.ts` | LLM step for eval iterations |
| `${CONVEX_HTTP_URL}/stream` | POST | `eval-agent.ts`, `negative-test-agent.ts` | AI test case generation |
| `${CONVEX_HTTP_URL}/ingest-chat` | POST | `chat-ingestion.ts` | Persist chat messages |

#### Server-Side ConvexHttpClient Calls

| Function | Caller | Purpose |
|---|---|---|
| `query("testSuites:listTestCases")` | `evals/route-helpers.ts` | Look up test cases with auth |
| `mutation("testIterations:create")` | eval routes | Persist test results |

---

## 3. Target Architecture (SQLite)

### 3.1 Data Flow Diagram (Target)

```
┌───────────────────────────────────────────────────────────┐
│                  MCPJam Inspector (Local)                   │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────┐   REST + SSE    ┌────────────────────┐  │
│  │   React      │ ◄────────────► │   Hono Server       │  │
│  │   Client     │   /api/v2/*     │   (port 6274)       │  │
│  │              │                │                      │  │
│  └──────────────┘                │  ┌────────────────┐ │  │
│                                  │  │ SQLite DB      │ │  │
│                                  │  │ (better-       │ │  │
│                                  │  │  sqlite3)      │ │  │
│                                  │  │ In-process,    │ │  │
│                                  │  │ zero-config    │ │  │
│                                  │  └────────────────┘ │  │
│                                  │                      │  │
│                                  │  ┌────────────────┐ │  │
│                                  │  │ LLM Direct     │ │  │
│                                  │  │ (OpenRouter    │ │  │
│                                  │  │  via .env key) │ │  │
│                                  │  └────────────────┘ │  │
│                                  │                      │  │
│                                  │  ┌────────────────┐ │  │
│                                  │  │ MCP Client     │ │  │
│                                  │  │ Manager        │ │  │
│                                  │  └────────────────┘ │  │
│                                  └────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### 3.2 Why SQLite (better-sqlite3)

| Criterion | better-sqlite3 | PocketBase | Plain Filesystem |
|---|---|---|---|
| **Deployment** | `npm install` — in-process | Separate Go binary on port 8090 | No deps |
| **Performance** | Direct C++ bindings, sync API | HTTP roundtrip per call | File I/O per operation |
| **Querying** | Full SQL (JOINs, indexes, etc.) | Full SQL (via PocketBase API) | None — must load entire files |
| **Transactions** | ACID transactions | ACID transactions | None |
| **Concurrency** | WAL mode supports concurrent reads | Full concurrency | No concurrent writes |
| **Real-time** | Must build SSE layer | Built-in SSE subscriptions | None |
| **Auth** | Must implement | Built-in auth system | N/A |
| **Admin UI** | None (use sqlite3 CLI) | Built-in dashboard | Text editor |
| **Disk format** | Single `.db` file | Single `.db` file | Multiple JSON files |
| **Overhead** | ~0 (in-process) | ~20MB Go process | ~0 |
| **Best for** | Embedded single-user desktop | Self-hosted with admin needs | Config-only, no history |

**Decision**: `better-sqlite3` for true embedded/local deployment. It has zero external process overhead, synchronous API (simpler than async drivers), and is battle-tested in Electron apps.

### 3.3 Why Not Plain Filesystem

Plain JSON/YAML files are insufficient because:
- Chat history requires **querying** (search by title, filter by date/model)
- Test suites have **relational structure** (suite → cases → iterations)
- Concurrent access from multiple browser tabs needs **locking**
- Performance degrades linearly with file count and size
- No atomic writes (risk of data corruption on crash)

Plain filesystem is viable only for MCP server configs (simple key-value), but not for the full feature set.

---

## 4. SQLite Schema Design

### 4.1 Table Definitions

```sql
-- Core: MCP Server configurations
CREATE TABLE servers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  transport_type TEXT NOT NULL CHECK(transport_type IN ('stdio', 'http', 'sse', 'streamable-http')),
  config TEXT NOT NULL DEFAULT '{}',  -- JSON: command, args, env, url, headers, etc.
  workspace_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);
CREATE INDEX idx_servers_workspace ON servers(workspace_id);

-- Core: Chat sessions with LLMs
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT,
  messages TEXT NOT NULL DEFAULT '[]',  -- JSON array of ModelMessage[]
  model TEXT,
  system_prompt TEXT,
  server_id TEXT,
  workspace_id TEXT,
  topic_map TEXT,                        -- JSON snapshot of topic structure
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);
CREATE INDEX idx_chat_sessions_workspace ON chat_sessions(workspace_id);
CREATE INDEX idx_chat_sessions_created ON chat_sessions(created_at DESC);

-- Core: Workspaces
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  settings TEXT NOT NULL DEFAULT '{}',  -- JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Core: Cached MCP tool definitions (populated from MCP server introspection)
CREATE TABLE tools (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  input_schema TEXT,  -- JSON Schema
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX idx_tools_server ON tools(server_id);
CREATE UNIQUE INDEX idx_tools_server_name ON tools(server_id, name);

-- Core: Cached MCP resource definitions
CREATE TABLE resources (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  server_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  name TEXT,
  description TEXT,
  mime_type TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX idx_resources_server ON resources(server_id);
CREATE UNIQUE INDEX idx_resources_server_uri ON resources(server_id, uri);

-- Core: Cached MCP prompt definitions
CREATE TABLE prompts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  arguments TEXT,  -- JSON array of prompt argument definitions
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX idx_prompts_server ON prompts(server_id);
CREATE UNIQUE INDEX idx_prompts_server_name ON prompts(server_id, name);

-- Evals: Test suites
CREATE TABLE test_suites (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  server_id TEXT,
  workspace_id TEXT,
  config TEXT NOT NULL DEFAULT '{}',  -- JSON: model, systemPrompt, etc.
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);
CREATE INDEX idx_test_suites_workspace ON test_suites(workspace_id);

-- Evals: Test cases within suites
CREATE TABLE test_cases (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  suite_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  input TEXT NOT NULL DEFAULT '{}',          -- JSON: the test input
  expected_output TEXT,                       -- JSON: expected behavior
  negative_test INTEGER NOT NULL DEFAULT 0,   -- boolean flag
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE CASCADE
);
CREATE INDEX idx_test_cases_suite ON test_cases(suite_id);

-- Evals: Test execution iterations
CREATE TABLE test_iterations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  test_case_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pass', 'fail', 'error', 'running')),
  actual_output TEXT,           -- JSON: what the LLM/tool actually returned
  error_message TEXT,
  duration_ms INTEGER,
  model TEXT,
  tokens_used INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);
CREATE INDEX idx_test_iterations_case ON test_iterations(test_case_id);
CREATE INDEX idx_test_iterations_created ON test_iterations(created_at DESC);

-- Inspector: Session-to-server mappings (ephemeral, per browser session)
CREATE TABLE inspector_session_servers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',  -- JSON: overrides for this session
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, server_id)
);
CREATE INDEX idx_session_servers_session ON inspector_session_servers(session_id);

-- User preferences (single-row table for local mode)
CREATE TABLE user_preferences (
  id INTEGER PRIMARY KEY DEFAULT 1,  -- always row 1
  name TEXT DEFAULT 'Local User',
  email TEXT,
  preferences TEXT NOT NULL DEFAULT '{}',  -- JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (id = 1)  -- enforce single row
);

-- Custom views per workspace
CREATE TABLE views (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('mcp_app', 'openai_app')),
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',  -- JSON: view configuration
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX idx_views_workspace ON views(workspace_id);
```

### 4.2 Schema Design Principles

- **JSON columns for flexible data**: Complex/nested structures (tool schemas, message arrays, configs) stored as JSON text. SQLite's `json_extract()` enables querying when needed.
- **UUIDs as primary keys**: `lower(hex(randomblob(16)))` generates 32-char hex IDs compatible with Convex's ID format.
- **Cascade deletes**: When a server is deleted, its tools/resources/prompts/session-mappings are automatically cleaned up.
- **Indexes on foreign keys**: All FK columns indexed for join performance.
- **WAL mode**: `PRAGMA journal_mode=WAL` for concurrent read access from multiple browser tabs.

---

## 5. REST API Design

All new endpoints live under `/api/v2/` to avoid collision with existing `/api/` routes. The Hono server already handles routing on port 6274.

### 5.1 CRUD Pattern

Each entity follows the same REST pattern:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v2/{entity}` | List all (with optional query filters) |
| `GET` | `/api/v2/{entity}/:id` | Get single record |
| `POST` | `/api/v2/{entity}` | Create new record |
| `PATCH` | `/api/v2/{entity}/:id` | Update record |
| `DELETE` | `/api/v2/{entity}/:id` | Delete record |

### 5.2 Endpoint Catalog

| Entity | Base Path | Notes |
|---|---|---|
| Servers | `/api/v2/servers` | Core — most critical |
| Chat Sessions | `/api/v2/chat-sessions` | Large payloads (messages JSON) |
| Workspaces | `/api/v2/workspaces` | Simple CRUD |
| Tools | `/api/v2/tools` | Filtered by `?serverId=` |
| Resources | `/api/v2/resources` | Filtered by `?serverId=` |
| Prompts | `/api/v2/prompts` | Filtered by `?serverId=` |
| Test Suites | `/api/v2/test-suites` | Includes nested cases |
| Test Cases | `/api/v2/test-cases` | Filtered by `?suiteId=` |
| Test Iterations | `/api/v2/test-iterations` | Filtered by `?testCaseId=` |
| Session Servers | `/api/v2/session-servers` | Filtered by `?sessionId=` |
| User Preferences | `/api/v2/preferences` | Single record GET/PATCH |
| Views | `/api/v2/views` | Filtered by `?workspaceId=` |

### 5.3 Special Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v2/chat-sessions/:id/messages` | Append messages to a session (incremental update) |
| `GET` | `/api/v2/chat-sessions/:id/topic-map` | Get topic map snapshot for a session |
| `POST` | `/api/v2/llm/stream` | Direct LLM streaming (replaces Convex `/stream`) |
| `DELETE` | `/api/v2/test-cases/batch` | Batch delete test cases |

---

## 6. LLM Proxy Migration

### 6.1 Current Flow (via Convex)

```
Client → Hono Server → Convex /stream → OpenRouter → SSE response
                    ↘ Convex /ingest-chat → Persist to Convex DB
```

### 6.2 Target Flow (Direct)

```
Client → Hono Server → OpenRouter (direct) → SSE response
                    ↘ Persist to SQLite (local)
```

### 6.3 Changes Required

**File: `server/utils/mcpjam-stream-handler.ts`**
- Replace `fetch(`${CONVEX_HTTP_URL}/stream`, ...)` with direct `@ai-sdk` call
- API key read from `OPENROUTER_API_KEY` env var (already supported)
- After streaming completes, persist messages to SQLite via local API

**File: `server/utils/chat-ingestion.ts`**
- Replace `fetch(`${CONVEX_HTTP_URL}/ingest-chat`, ...)` with SQLite insert
- Direct `db.prepare('INSERT INTO chat_sessions ...').run(...)` call

**Files: `server/services/evals-runner.ts`, `eval-agent.ts`, `negative-test-agent.ts`**
- Replace Convex `/stream` calls with direct `@ai-sdk` calls
- Same pattern as `mcpjam-stream-handler.ts`

The `@ai-sdk/openai`, `@ai-sdk/anthropic`, and related packages are **already installed** in the project. The streaming infrastructure (SSE parsing, tool call handling) is already in `mcpjam-stream-handler.ts`. The change is primarily **configuration**, not a rewrite.

---

## 7. Client-Side Migration Strategy

### 7.1 Approach: Dual-Mode with Feature Flag

The migration supports running in either Convex mode or SQLite mode, controlled by an environment variable:

```
# .env.local
PERSISTENCE_MODE=sqlite    # or "convex" (default for backward compat)
```

This allows incremental migration — components can be updated one at a time.

### 7.2 Data Provider Interface

```typescript
// client/src/lib/data-provider/types.ts

export interface DataProvider {
  // Servers
  listServers(): Promise<Server[]>;
  getServer(id: string): Promise<Server>;
  createServer(data: CreateServerInput): Promise<Server>;
  updateServer(id: string, data: Partial<Server>): Promise<Server>;
  deleteServer(id: string): Promise<void>;

  // Chat Sessions
  listChatSessions(): Promise<ChatSession[]>;
  getChatSession(id: string): Promise<ChatSession>;
  createChatSession(data: CreateChatSessionInput): Promise<ChatSession>;
  appendMessages(id: string, messages: Message[]): Promise<void>;
  deleteChatSession(id: string): Promise<void>;
  getTopicMap(id: string): Promise<TopicMapSnapshot>;

  // Workspaces
  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace>;
  createWorkspace(data: CreateWorkspaceInput): Promise<Workspace>;
  updateWorkspace(id: string, data: Partial<Workspace>): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;

  // ... similar for tools, resources, prompts, testSuites, etc.
}

export interface DataProviderContext {
  provider: DataProvider;
  mode: 'convex' | 'sqlite';
}
```

### 7.3 React Hook Adapter

Create hooks that abstract over the data provider:

```typescript
// client/src/hooks/use-data-query.ts
export function useDataQuery<T>(
  key: string[],
  queryFn: () => Promise<T>,
  options?: { enabled?: boolean }
) {
  // Uses @tanstack/react-query internally
  // In SQLite mode: fetches from /api/v2/* endpoints
  // In Convex mode: wraps useQuery from convex/react
  return useQuery({ queryKey: key, queryFn, ...options });
}

// client/src/hooks/use-data-mutation.ts
export function useDataMutation<TInput, TOutput>(
  key: string[],
  mutationFn: (input: TInput) => Promise<TOutput>,
) {
  return useMutation({ mutationKey: key, mutationFn });
}
```

### 7.4 Component Migration Pattern

```typescript
// BEFORE (Convex direct):
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

function ServersTable() {
  const servers = useQuery(api.servers.list, {});
  const deleteServer = useMutation(api.servers.delete);
  // ...
}

// AFTER (abstracted):
import { useDataQuery, useDataMutation } from '../hooks/use-data-query';

function ServersTable() {
  const { data: servers } = useDataQuery(['servers'], () =>
    dataProvider.listServers()
  );
  const deleteServer = useDataMutation(['servers', 'delete'],
    (id: string) => dataProvider.deleteServer(id)
  );
  // ... rest unchanged
}
```

### 7.5 Real-Time Subscriptions

Convex provides automatic real-time updates via WebSocket. For SQLite mode, we need an alternative:

**Option A: SSE on the Hono server** (Recommended)
- Server emits SSE events when data changes
- Client subscribes via `EventSource`
- `useDataQuery` hook listens and refetches on events

**Option B: Polling** (Simpler)
- `useDataQuery` refetches every N seconds
- Adequate for single-user local deployment

**Option C: No real-time** (Simplest)
- User manually refreshes or navigates to trigger refetch
- Acceptable for MVP

For local single-user mode, **Option B (polling at 5-second intervals)** is recommended as the initial approach. SSE can be added later for the chat streaming experience.

---

## 8. Authentication Simplification

### 8.1 Current Auth Stack

```
WorkOS AuthKit → ConvexProviderWithAuthKit → Convex Auth → Database queries
                                      ↘ GuestConvexAuthBridge (unauthenticated)
```

### 8.2 Local Auth (Simplified)

For local mode:
- **No authentication required** — single user on localhost
- `user_preferences` table holds the single user's settings
- Remove `@convex-dev/workos` dependency in local mode
- Session token (already generated by the server) provides basic CSRF protection

### 8.3 Migration Path

1. Create a `<LocalAuthProvider>` that provides a hardcoded local user
2. Gate with `if (persistenceMode === 'sqlite')` in `main.tsx`
3. Keep Convex auth for hosted mode

---

## 9. File Structure (New Files)

```
mcpjam-inspector/
  server/
    db/
      connection.ts           # SQLite connection singleton + WAL config
      schema.ts               # CREATE TABLE statements
      migrations.ts           # Schema version tracking and migration
      seed.ts                 # Default data (default workspace, user prefs)
    routes/
      api/
        v2/
          servers.ts          # CRUD for servers
          chat-sessions.ts    # CRUD for chat sessions
          workspaces.ts       # CRUD for workspaces
          tools.ts            # CRUD for cached tools
          resources.ts        # CRUD for cached resources
          prompts.ts          # CRUD for cached prompts
          test-suites.ts      # CRUD for test suites
          test-cases.ts       # CRUD for test cases
          test-iterations.ts  # CRUD for test iterations
          session-servers.ts  # CRUD for session-server mappings
          preferences.ts      # User preferences
          views.ts            # Custom views
          llm-stream.ts       # Direct LLM streaming (replaces Convex /stream)
  client/
    src/
      lib/
        data-provider/
          types.ts            # DataProvider interface
          sqlite-provider.ts  # REST API implementation
          convex-provider.ts  # Convex wrapper implementation
          index.ts            # Factory: createProvider(mode)
      hooks/
        use-data-query.ts     # Abstracted query hook
        use-data-mutation.ts  # Abstracted mutation hook
```

---

## 10. Implementation Phases

### Phase 1: SQLite Foundation (Days 1-3)
- [ ] Add `better-sqlite3` dependency
- [ ] Create `server/db/connection.ts` — connection singleton with WAL mode
- [ ] Create `server/db/schema.ts` — all CREATE TABLE statements
- [ ] Create `server/db/migrations.ts` — version tracking
- [ ] Create `server/db/seed.ts` — default workspace + user preferences
- [ ] Wire DB initialization into server startup

### Phase 2: Core REST API (Days 3-6)
- [ ] Create `/api/v2/servers` CRUD routes
- [ ] Create `/api/v2/chat-sessions` CRUD routes
- [ ] Create `/api/v2/workspaces` CRUD routes
- [ ] Create `/api/v2/tools`, `/api/v2/resources`, `/api/v2/prompts` routes
- [ ] Create `/api/v2/session-servers` routes
- [ ] Create `/api/v2/preferences` routes
- [ ] Add `PERSISTENCE_MODE` env var gating

### Phase 3: LLM Direct Streaming (Days 6-8)
- [ ] Create `/api/v2/llm/stream` endpoint
- [ ] Modify `mcpjam-stream-handler.ts` to use direct LLM calls when in SQLite mode
- [ ] Modify `chat-ingestion.ts` to persist to SQLite
- [ ] Modify `evals-runner.ts`, `eval-agent.ts`, `negative-test-agent.ts` for SQLite mode

### Phase 4: Client Data Provider (Days 8-11)
- [ ] Create `DataProvider` interface and implementations
- [ ] Create `useDataQuery` / `useDataMutation` hooks
- [ ] Create factory for provider selection based on `PERSISTENCE_MODE`
- [ ] Migrate `servers-table.tsx` and `server-config.tsx` (highest value, most used)
- [ ] Migrate `ChatTabV2.tsx` and related hooks
- [ ] Migrate `EvalsTab.tsx` and eval components
- [ ] Migrate remaining components (workspaces, tools, resources, prompts, views)

### Phase 5: Auth Simplification (Day 11-12)
- [ ] Create `<LocalAuthProvider>` component
- [ ] Update `main.tsx` to select auth provider based on mode
- [ ] Remove Convex/WorkOS dependencies when in SQLite mode

### Phase 6: Testing & Polish (Days 12-14)
- [ ] Integration tests for all REST endpoints
- [ ] Verify all features work in SQLite mode
- [ ] Performance testing with large chat histories
- [ ] Documentation for `PERSISTENCE_MODE=sqlite` configuration
- [ ] Update Docker Compose for SQLite volume mount

---

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Unknown Convex function logic is complex | Medium | High | Start with simple CRUD; reverse-engineer from client call patterns |
| Data schema mismatch between Convex and SQLite | Medium | Medium | JSON columns for flexible data; strict schema for core fields |
| 50+ component files need updating | High | Medium | Incremental migration with dual-mode support |
| Loss of real-time updates degrades UX | Low | Medium | Start with polling; add SSE if needed |
| `better-sqlite3` native compilation issues on some platforms | Low | High | Pre-built binaries available for all major platforms via prebuilds |
| Large chat histories slow SQLite | Low | Low | Pagination + indexes; SQLite handles GB-scale databases well |
| Breaking existing Convex mode during migration | Medium | High | Dual-mode architecture; Convex mode untouched until component is migrated |

---

## 12. Prior Art: PocketBase Experiment

An earlier experiment at `/home/markus/src/inspector_pocketbase/` attempted a similar migration using PocketBase instead of raw SQLite. Key lessons:

### What Worked
- Dual-mode architecture with `isPocketBaseConfigured()` gate
- React hooks (`usePocketBaseQuery`, etc.) mirroring Convex's API
- Script-based schema setup via PocketBase admin API
- Auth bridge for guest/local users

### What Was Incomplete
- No actual component integration (none of the existing components were updated)
- No LLM proxy replacement (still called Convex `/stream`)
- No real-time subscriptions
- No server-side integration (`ConvexHttpClient` calls still present)
- Based on older codebase (~50 commits behind)

### Why SQLite Over PocketBase for This Approach
- PocketBase requires a **separate process** (Go binary on port 8090)
- For an embedded Electron app, an in-process database is preferable
- `better-sqlite3` has zero deployment overhead
- PocketBase's admin UI and auth system are overkill for single-user local mode

---

## 13. Success Criteria

- [ ] MCPJam Inspector starts and runs fully with `PERSISTENCE_MODE=sqlite`
- [ ] All core features work: server management, chat, evals, workspaces
- [ ] No Convex dependency when running in SQLite mode
- [ ] Database stored in a single `.db` file in the user's data directory
- [ ] Existing Convex mode continues to work unchanged
- [ ] Migration between modes possible (export/import)