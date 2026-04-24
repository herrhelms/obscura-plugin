#!/usr/bin/env bash
# obscura-plugin: install.sh
#
# Idempotent bootstrap. Installs Node deps into a plugin-local .runtime/
# on first run and exits fast on subsequent runs. Verifies the Obscura
# binary at ~/.obscura/obscura exists.
#
# Invoked by both /ui:inspect and /ui:flush before the driver runs.

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$PLUGIN_ROOT/.runtime"
PKG_JSON="$RUNTIME_DIR/package.json"
NODE_MODULES="$RUNTIME_DIR/node_modules"
STAMP="$RUNTIME_DIR/.installed"

log() { printf "[obscura-plugin] %s\n" "$*" >&2; }

# ---------- Obscura check ----------
OBSCURA_BIN="${OBSCURA_BIN:-$HOME/.obscura/obscura}"
if [[ ! -x "$OBSCURA_BIN" ]]; then
  log "ERROR: Obscura binary not found or not executable at $OBSCURA_BIN"
  log "Install it from https://github.com/h4ckf0r0day/obscura and ensure it is executable:"
  log "  chmod +x $OBSCURA_BIN"
  exit 2
fi

# ---------- Node check ----------
if ! command -v node >/dev/null 2>&1; then
  log "ERROR: Node.js is required but not found in PATH."
  log "Install Node 18+ from https://nodejs.org/ or via your package manager."
  exit 2
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  log "ERROR: Node 18+ required, found $(node --version)"
  exit 2
fi

# ---------- Fast path: already installed ----------
if [[ -f "$STAMP" ]] && [[ -d "$NODE_MODULES" ]]; then
  exit 0
fi

log "First-run bootstrap: installing Node dependencies into .runtime/"

mkdir -p "$RUNTIME_DIR"

if [[ ! -f "$PKG_JSON" ]]; then
  cat >"$PKG_JSON" <<'JSON'
{
  "name": "obscura-plugin-runtime",
  "private": true,
  "version": "0.1.0",
  "description": "Plugin-local runtime for the obscura-plugin plugin.",
  "type": "module",
  "dependencies": {
    "playwright-core": "^1.48.0",
    "axe-core": "^4.10.0"
  }
}
JSON
fi

# Prefer npm; fall back to yarn/pnpm if present.
cd "$RUNTIME_DIR"
if command -v npm >/dev/null 2>&1; then
  npm install --omit=dev --no-audit --no-fund --loglevel=error
elif command -v pnpm >/dev/null 2>&1; then
  pnpm install --prod
elif command -v yarn >/dev/null 2>&1; then
  yarn install --production
else
  log "ERROR: no package manager (npm/pnpm/yarn) found."
  exit 2
fi

touch "$STAMP"
log "Runtime ready at $RUNTIME_DIR"
