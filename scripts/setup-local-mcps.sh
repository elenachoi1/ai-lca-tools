#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "$script_dir/.." && pwd)"
app_dir="$project_root/apps/ai-chat-tool"

cd -- "$project_root"

shadcn_bin="$(npm exec --workspace @ai-lca-tools/ai-chat-tool -- which shadcn)"
if [[ ! -x "$shadcn_bin" ]]; then
  echo "shadcn is not installed. Run npm install first." >&2
  exit 1
fi

if command -v claude >/dev/null 2>&1; then
  claude mcp remove --scope local shadcn >/dev/null 2>&1 || true
  claude mcp add --scope local shadcn -- "$shadcn_bin" mcp --cwd "$app_dir"
else
  echo "Claude Code not found; skipping shadcn MCP registration."
fi

if command -v opencode >/dev/null 2>&1; then
  echo "OpenCode: shadcn MCP configured in opencode.json."
else
  echo "OpenCode not found; opencode.json remains available for later use."
fi

if command -v codex >/dev/null 2>&1; then
  codex mcp remove shadcn >/dev/null 2>&1 || true
  codex mcp add shadcn -- "$shadcn_bin" mcp --cwd "$app_dir"
else
  echo "Codex not found; skipping shadcn MCP registration."
fi
