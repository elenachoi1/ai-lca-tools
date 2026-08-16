#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$script_dir/apps/ai-chat-tool"

host="${HOST:-0.0.0.0}"
port="${PORT:-5173}"

if [[ ! -d "$script_dir/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  npm install --prefix "$script_dir"
fi

echo "Starting the AI chat tool at http://$host:$port"
exec npm --prefix "$script_dir" run dev --workspace @ai-lca-tools/ai-chat-tool -- --host "$host" --port "$port"
