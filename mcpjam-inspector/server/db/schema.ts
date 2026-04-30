/**
 * SQLite Schema Definitions
 *
 * All CREATE TABLE statements for the embedded SQLite database.
 * These are executed idempotently during database initialization.
 */

export const SCHEMA_VERSION = 1;

export const CREATE_TABLES = [
  // Schema version tracking
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT
  )`,

  // ─── Core Entities ───────────────────────────────────────────────

  // Workspaces
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // MCP Server configurations
  `CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    transport_type TEXT NOT NULL CHECK(transport_type IN ('stdio', 'http', 'sse', 'streamable-http')),
    config TEXT NOT NULL DEFAULT '{}',
    workspace_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
  )`,

  // Cached MCP tool definitions
  `CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    input_schema TEXT,
    cached_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  )`,

  // Cached MCP resource definitions
  `CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    uri TEXT NOT NULL,
    name TEXT,
    description TEXT,
    mime_type TEXT,
    cached_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  )`,

  // Cached MCP prompt definitions
  `CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    arguments TEXT,
    cached_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  )`,

  // ─── Chat ────────────────────────────────────────────────────────

  // Chat sessions with LLMs
  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    messages TEXT NOT NULL DEFAULT '[]',
    model TEXT,
    system_prompt TEXT,
    server_id TEXT,
    workspace_id TEXT,
    topic_map TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
  )`,

  // ─── Evals ───────────────────────────────────────────────────────

  // Test suites
  `CREATE TABLE IF NOT EXISTS test_suites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    server_id TEXT,
    workspace_id TEXT,
    config TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
  )`,

  // Test cases within suites
  `CREATE TABLE IF NOT EXISTS test_cases (
    id TEXT PRIMARY KEY,
    suite_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    input TEXT NOT NULL DEFAULT '{}',
    expected_output TEXT,
    negative_test INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE CASCADE
  )`,

  // Test execution iterations
  `CREATE TABLE IF NOT EXISTS test_iterations (
    id TEXT PRIMARY KEY,
    test_case_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pass', 'fail', 'error', 'running')),
    actual_output TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    model TEXT,
    tokens_used INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
  )`,

  // ─── Session State ───────────────────────────────────────────────

  // Inspector session-to-server mappings
  `CREATE TABLE IF NOT EXISTS inspector_session_servers (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    server_id TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, server_id)
  )`,

  // ─── User Preferences ────────────────────────────────────────────

  // Single-row user preferences for local mode
  `CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT DEFAULT 'Local User',
    email TEXT,
    preferences TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (id = 1)
  )`,

  // ─── Views ───────────────────────────────────────────────────────

  // Custom views per workspace
  `CREATE TABLE IF NOT EXISTS views (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('mcp_app', 'openai_app')),
    name TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  )`,
];

export const CREATE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_servers_workspace ON servers(workspace_id)",
  "CREATE INDEX IF NOT EXISTS idx_tools_server ON tools(server_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_tools_server_name ON tools(server_id, name)",
  "CREATE INDEX IF NOT EXISTS idx_resources_server ON resources(server_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_server_uri ON resources(server_id, uri)",
  "CREATE INDEX IF NOT EXISTS idx_prompts_server ON prompts(server_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_server_name ON prompts(server_id, name)",
  "CREATE INDEX IF NOT EXISTS idx_chat_sessions_workspace ON chat_sessions(workspace_id)",
  "CREATE INDEX IF NOT EXISTS idx_chat_sessions_created ON chat_sessions(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_test_suites_workspace ON test_suites(workspace_id)",
  "CREATE INDEX IF NOT EXISTS idx_test_cases_suite ON test_cases(suite_id)",
  "CREATE INDEX IF NOT EXISTS idx_test_iterations_case ON test_iterations(test_case_id)",
  "CREATE INDEX IF NOT EXISTS idx_test_iterations_created ON test_iterations(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_session_servers_session ON inspector_session_servers(session_id)",
  "CREATE INDEX IF NOT EXISTS idx_views_workspace ON views(workspace_id)",
];