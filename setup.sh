#!/usr/bin/env bash
# Connect this host to the canonical devboard harness.
#
# Creates the untracked links that share one harness checkout:
#   .devboard          -> <harness>/.devboard
#   .omp/commands      -> <harness>/.omp/commands
#   .omp/extensions    -> <harness>/.omp/extensions
#
# The wrapper links point at the harness's installed .omp, so this host runs
# exactly the wrappers the harness owner runs; rerunning .devboard/install.sh
# there updates both. .omp/skills stays a real per-host directory.
#
# Safe to rerun. A real directory or a link to another target is a conflict and
# is never overwritten.
set -euo pipefail

root=$(cd -- "$(dirname -- "$0")" && pwd)

harness=${DEVBOARD_HARNESS_ROOT:-/home/ds/devboard}

if [ ! -d "$harness/.devboard" ]; then
  printf 'setup: no harness at %s/.devboard\n' "$harness" >&2
  exit 1
fi

link() {
  target=$1
  path=$2
  if [ -L "$path" ]; then
    if [ "$(readlink "$path")" = "$target" ]; then
      printf 'setup: %s already linked\n' "$path"
      return
    fi
    printf 'setup: %s links to %s, expected %s\n' \
      "$path" "$(readlink "$path")" "$target" >&2
    exit 1
  fi
  if [ -e "$path" ]; then
    printf 'setup: %s exists and is not a symlink\n' "$path" >&2
    exit 1
  fi
  ln -s "$target" "$path"
  printf 'setup: linked %s -> %s\n' "$path" "$target"
}

link "$harness/.devboard" "$root/.devboard"
mkdir -p "$root/.omp/skills"
link "$harness/.omp/commands" "$root/.omp/commands"
link "$harness/.omp/extensions" "$root/.omp/extensions"
