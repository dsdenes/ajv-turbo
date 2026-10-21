#!/usr/bin/env bash
# Start the devboard interface for this host.
#
# PORT defaults to 8081 so this interface can run beside the canonical
# checkout's server, which defaults to 8080.
set -euo pipefail

root=$(cd -- "$(dirname -- "$0")" && pwd)

export ADRS_DIR="$root/adrs"
export REPO_DIR="$root"
export GOAL_FILE="$root/GOAL.md"
export PORT="${PORT:-8081}"

cd "$root/.devboard"
exec bun run start
