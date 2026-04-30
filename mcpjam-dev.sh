#!/usr/bin/env bash
#
# mcpjam-dev.sh — Build-if-stale launcher for local development
#
# Checks if component sources are newer than their dist/ outputs and
# rebuilds only when necessary, then launches the requested tool.
#
# Usage:
#   ./mcpjam-dev.sh inspector [args...]       # Start the web-based Inspector
#   ./mcpjam-dev.sh inspector --rebuild       # Force rebuild before starting
#   ./mcpjam-dev.sh <cli-command> [args...]   # Run the mcpjam CLI
#   ./mcpjam-dev.sh --help                    # CLI help
#
# Examples:
#   ./mcpjam-dev.sh inspector --config mcp-config.json
#   ./mcpjam-dev.sh inspector -- npx @modelcontextprotocol/server-everything
#   ./mcpjam-dev.sh server probe -- npx @modelcontextprotocol/server-everything
#   ./mcpjam-dev.sh tools list

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors (disabled if not a terminal)
if [[ -t 1 ]]; then
  GREEN="\033[0;32m"
  YELLOW="\033[0;33m"
  CYAN="\033[0;36m"
  DIM="\033[2m"
  RESET="\033[0m"
else
  GREEN="" YELLOW="" CYAN="" DIM="" RESET=""
fi

log()  { echo -e "${GREEN}[mcpjam-dev]${RESET} $*"; }
warn() { echo -e "${YELLOW}[mcpjam-dev]${RESET} $*"; }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Return 0 if the newest file under <dir> (excluding node_modules & dist)
# is older than the newest file under <marker_dir>.  Returns 1 otherwise
# (meaning a rebuild is needed).  If marker_dir doesn't exist, always 1.
is_fresh() {
  local src_dir="$1"
  local marker_dir="$2"

  # No marker → definitely stale
  if [[ ! -e "$marker_dir" ]]; then
    return 1
  fi

  # Find the most-recently-modified source file (skip node_modules, dist, .git)
  local newest_src
  newest_src="$(find "$src_dir" \
    \( -name node_modules -o -name dist -o -name .git -o -name .vite \) -prune \
    -o -type f -newer "$marker_dir" -print -quit 2>/dev/null)"

  if [[ -n "$newest_src" ]]; then
    return 1  # source is newer → stale
  fi

  return 0  # up to date
}

# ---------------------------------------------------------------------------
# Detect mode: inspector vs CLI
# ---------------------------------------------------------------------------

MODE="cli"
if [[ $# -gt 0 && "$1" == "inspector" ]]; then
  MODE="inspector"
  shift  # consume "inspector" so remaining args are forwarded
fi

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SDK_DIR="$REPO_ROOT/sdk"
CLI_DIR="$REPO_ROOT/cli"
INSPECTOR_DIR="$REPO_ROOT/mcpjam-inspector"
SDK_DIST="$SDK_DIR/dist"
CLI_DIST="$CLI_DIR/dist"
INSPECTOR_DIST="$INSPECTOR_DIR/dist"
INSPECTOR_SERVER="$INSPECTOR_DIST/server/index.js"  # key artifact the Inspector needs to start

# ---------------------------------------------------------------------------
# Build freshness check
# ---------------------------------------------------------------------------

NEED_SDK_REBUILD=false
NEED_CLI_REBUILD=false
NEED_INSPECTOR_REBUILD=false

# --- SDK (always checked — it's a dependency of everything) ---
if is_fresh "$SDK_DIR" "$SDK_DIST"; then
  echo -e "  ${CYAN}sdk${RESET}        ${DIM}✓ up to date${RESET}"
else
  echo -e "  ${CYAN}sdk${RESET}        ${YELLOW}⟳ needs rebuild${RESET}"
  NEED_SDK_REBUILD=true
fi

if [[ "$MODE" == "inspector" ]]; then
  # --- Inspector (depends on SDK) — use server entry as marker, not dist/ dir ---
  if is_fresh "$INSPECTOR_DIR" "$INSPECTOR_SERVER"; then
    if [[ "$NEED_SDK_REBUILD" == true ]]; then
      echo -e "  ${CYAN}inspector${RESET}  ${YELLOW}⟳ needs rebuild (sdk dependency changed)${RESET}"
      NEED_INSPECTOR_REBUILD=true
    else
      echo -e "  ${CYAN}inspector${RESET}  ${DIM}✓ up to date${RESET}"
    fi
  else
    echo -e "  ${CYAN}inspector${RESET}  ${YELLOW}⟳ needs rebuild${RESET}"
    NEED_INSPECTOR_REBUILD=true
  fi
else
  # --- CLI (depends on SDK) ---
  if is_fresh "$CLI_DIR" "$CLI_DIST"; then
    if [[ "$NEED_SDK_REBUILD" == true ]]; then
      echo -e "  ${CYAN}cli${RESET}        ${YELLOW}⟳ needs rebuild (sdk dependency changed)${RESET}"
      NEED_CLI_REBUILD=true
    else
      echo -e "  ${CYAN}cli${RESET}        ${DIM}✓ up to date${RESET}"
    fi
  else
    echo -e "  ${CYAN}cli${RESET}        ${YELLOW}⟳ needs rebuild${RESET}"
    NEED_CLI_REBUILD=true
  fi
fi

# ---------------------------------------------------------------------------
# Rebuild stale components
# ---------------------------------------------------------------------------

if [[ "$NEED_SDK_REBUILD" == true ]]; then
  log "Building SDK..."
  if ! npm run build -w @mcpjam/sdk --silent 2>&1; then
    echo -e "${YELLOW}[mcpjam-dev]${RESET} SDK build failed" >&2
    exit 1
  fi
  log "SDK built ✓"
fi

if [[ "$NEED_CLI_REBUILD" == true ]]; then
  log "Building CLI..."
  if ! npm run build -w @mcpjam/cli --silent 2>&1; then
    echo -e "${YELLOW}[mcpjam-dev]${RESET} CLI build failed" >&2
    exit 1
  fi
  log "CLI built ✓"
fi

if [[ "$NEED_INSPECTOR_REBUILD" == true ]]; then
  log "Building Inspector..."
  if ! npm run build -w @mcpjam/inspector 2>&1; then
    echo -e "${YELLOW}[mcpjam-dev]${RESET} Inspector build failed" >&2
    exit 1
  fi
  log "Inspector built ✓"
fi

# ---------------------------------------------------------------------------
# Ensure dist exists (first run after clean)
# ---------------------------------------------------------------------------

if [[ "$MODE" == "inspector" ]]; then
  if [[ ! -f "$INSPECTOR_SERVER" ]]; then
    warn "Inspector not built yet — running full build..."
    npm run build -w @mcpjam/sdk --silent 2>&1
    npm run build -w @mcpjam/inspector 2>&1
    log "Inspector built ✓"
  fi
else
  if [[ ! -f "$CLI_DIST/index.js" ]]; then
    warn "CLI not built yet — running full build..."
    npm run build:packages --silent 2>&1
    log "Packages built ✓"
  fi
fi

# ---------------------------------------------------------------------------
# Launch
# ---------------------------------------------------------------------------

if [[ "$MODE" == "inspector" ]]; then
  # Start the Inspector web server (production mode with local fixes)
  # Forwards all remaining args (e.g. --config, --port, -- server-cmd)
  #
  # Default to SQLite persistence so the Inspector runs fully local
  # without needing a Convex cloud backend.  To use Convex instead:
  #   PERSISTENCE_MODE=convex ./mcpjam-dev.sh inspector
  export PERSISTENCE_MODE="${PERSISTENCE_MODE:-sqlite}"
  log "Starting Inspector (PERSISTENCE_MODE=$PERSISTENCE_MODE)..."
  exec npm start -w @mcpjam/inspector -- "$@"
else
  # Run the mcpjam CLI with forwarded arguments
  # Resolve modules from both the CLI workspace and the hoisted root node_modules
  NODE_PATH="$CLI_DIR/node_modules:$REPO_ROOT/node_modules" \
    exec node "$CLI_DIST/index.js" "$@"
fi