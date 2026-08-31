from __future__ import annotations

import json
import os
import secrets
from datetime import UTC, datetime

from flask import Flask, jsonify, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

app = Flask(__name__)
limiter = Limiter(key_func=get_remote_address, app=app, storage_uri="memory://")
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

USERS: dict[str, dict] = {
    "sarah.mitchell@example-app.com": {"name": "Sarah Mitchell", "registered": True},
    "james.wilson@example-app.com": {"name": "James Wilson", "registered": True},
    "maria.garcia@example-app.com": {"name": "Maria Garcia", "registered": True},
    "alex.thompson@example-app.com": {"name": "Alex Thompson", "registered": True},
    "priya.patel@example-app.com": {"name": "Priya Patel", "registered": True},
}

OTPS: dict[str, dict] = {}

OUTBOX: list[dict] = []

_flag_returned = False

def _generate_otp(email: str) -> str:
    code = f"{secrets.randbelow(1000000):06d}"
    OTPS[email] = {"code": code, "created": datetime.now(UTC).isoformat()}
    OUTBOX.append({"to": email, "code": code, "timestamp": datetime.now(UTC).isoformat()})
    return code

def _handle_mutation(mutation: dict) -> dict:
    query = mutation.get("query", "")

    if "sendLoginCode" in query:
        # Extract email from the query
        import re
        m = re.search(r'email:\s*"([^"]+)"', query)
        if not m:
            return {"errors": [{"message": "email required"}], "data": None}
        email = m.group(1)
        if email not in USERS:
            return {"errors": [{"message": "Unknown email"}], "data": None}
        _generate_otp(email)
        return {"data": {"sendLoginCode": {"success": True}}}

    if "verifyLoginCode" in query:
        import re
        code_m = re.search(r'code:\s*"([^"]+)"', query)
        email_m = re.search(r'email:\s*"([^"]+)"', query)
        if not code_m or not email_m:
            return {"errors": [{"message": "code and email required"}], "data": None}
        code = code_m.group(1)
        email = email_m.group(1)
        stored = OTPS.get(email)
        if not stored:
            return {
                "errors": [{"message": "No pending code for this email"}],
                "data": {"verifyLoginCode": None},
            }
        if code != stored["code"]:
            return {
                "errors": [{"message": "Invalid code", "extensions": {"code": "UNPROCESSABLE_ENTITY"}}],
                "data": {"verifyLoginCode": None},
            }

        token = secrets.token_hex(32)
        return {"data": {"verifyLoginCode": {"accessToken": token, "isNewUser": False}}}

    return {"errors": [{"message": "Unknown operation"}], "data": None}

@app.get("/")
def index() -> str:
    return (
        "<h1>GraphQL API Service</h1>"
        "<p>GraphQL endpoint: POST /graphql</p>"
        "<p>Passwordless login: sendLoginCode + verifyLoginCode</p>"
    )

@app.post("/auth/register")
def register() -> tuple:
    data = request.get_json(force=True, silent=True) or {}
    email = data.get("email", "")
    name = data.get("name", "Test User")
    if not email:
        return jsonify({"error": "email required"}), 400
    if email in USERS:
        return jsonify({"error": "email already registered"}), 409
    USERS[email] = {"name": name, "registered": True}
    return jsonify({"registered": email}), 201

@app.post("/graphql")
@limiter.limit("5/30second", override_defaults=False)
def graphql() -> tuple:
    global _flag_returned  # noqa: PLW0603
    raw = request.get_json(force=True, silent=True)
    if raw is None:
        return jsonify({"error": "invalid JSON"}), 400

    if isinstance(raw, dict):
        result = _handle_mutation(raw)
        return jsonify(result), 200

    if isinstance(raw, list):
        results = []
        verify_count = 0
        for mutation in raw:
            if not isinstance(mutation, dict):
                results.append({"errors": [{"message": "invalid operation"}]})
                continue
            result = _handle_mutation(mutation)
            results.append(result)
            if "verifyLoginCode" in mutation.get("query", ""):
                verify_count += 1

        if verify_count >= 3 and not _flag_returned:
            _flag_returned = True
            results.append({"data": {"_result": {"proven": True, "flag": FLAG}}})

        return jsonify(results), 200

    return jsonify({"error": "expected object or array"}), 400

@app.get("/api/users")
def list_users() -> tuple:
    return jsonify([{"email": e, "name": d["name"]} for e, d in USERS.items()]), 200

@app.get("/api/outbox")
def outbox() -> tuple:
    return jsonify(OUTBOX), 200

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
