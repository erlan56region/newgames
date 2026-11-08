#!/usr/bin/env bash
# Serve the catalogue locally. Usage: ./scripts/serve.sh [port]
set -euo pipefail
PORT="${1:-8080}"
cd "$(dirname "$0")/.."
echo "Open Source Games catalogue: http://localhost:${PORT}"
exec python3 -m http.server "$PORT" --bind 0.0.0.0
