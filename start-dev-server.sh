#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$script_dir/retail-chat"

host="${HOST:-0.0.0.0}"
port="${PORT:-5173}"

if [[ ! -d "$app_dir/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  npm ci --prefix "$app_dir"
fi

echo "Starting the retail chat dev server at http://$host:$port"
exec npm --prefix "$app_dir" run dev -- --host "$host" --port "$port"
