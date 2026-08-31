#!/usr/bin/env bash
# ============================================================
# Hackbot Arena — lab manager
#
# Usage:
#   ./setup.sh up [labsXX ...]     build & start labs (default: all)
#   ./setup.sh down [labsXX ...]   stop labs (keeps data volumes)
#   ./setup.sh reset [labsXX ...]  stop labs, DELETE VOLUMES, rebuild
#   ./setup.sh status              list running lab containers
#
# reset deletes data volumes and rebuilds images. labs01 stores its flag
# inside its SQLite volume, and labs06+ bake the flag into the image at
# build time — either way a reset is required after changing any FLAG.
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABS_DIR="$REPO_ROOT/labs"
LAB_PATTERN='^labs[0-9]{2}$'

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

require_compose() {
  if ! docker compose version >/dev/null 2>&1; then
    echo "error: docker compose plugin not found (see README.md Setup)" >&2
    exit 1
  fi
}

resolve_labs() {
  if [ "$#" -eq 0 ]; then
    find "$LABS_DIR" -mindepth 1 -maxdepth 1 -type d -name 'labs*' | sort
  else
    for name in "$@"; do
      if [[ ! "$name" =~ $LAB_PATTERN ]] || [ ! -d "$LABS_DIR/$name" ]; then
        echo "error: unknown lab '$name' (expected labsXX under $LABS_DIR)" >&2
        exit 1
      fi
      printf '%s\n' "$LABS_DIR/$name"
    done
  fi
}

compose() { # compose <lab-dir> <args...>
  local lab_dir="$1"; shift
  (cd "$lab_dir/challenge" && docker compose "$@")
}

cmd="${1:-}"; shift || true
case "$cmd" in
  up|down|reset) ;;
  status)
    require_compose
    found=0
    for lab_dir in $(resolve_labs); do
      rows="$(compose "$lab_dir" ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | tail -n +2)"
      if [[ -n "$rows" ]]; then
        echo "$rows"
        found=1
      fi
    done
    (( found )) || echo "No lab containers running."
    exit 0 ;;
  *) usage ;;
esac

require_compose
for lab_dir in $(resolve_labs "$@"); do
  lab="$(basename "$lab_dir")"
  case "$cmd" in
    up)    echo "==> $lab: up"   ; compose "$lab_dir" up -d --build ;;
    down)  echo "==> $lab: down" ; compose "$lab_dir" down ;;
    reset) echo "==> $lab: reset (deleting volumes)"
           compose "$lab_dir" down -v
           compose "$lab_dir" up -d --build ;;
  esac
done
