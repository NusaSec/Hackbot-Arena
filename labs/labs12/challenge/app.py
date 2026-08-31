from __future__ import annotations

import os
import secrets
from datetime import UTC, datetime

from flask import Flask, jsonify, request

app = Flask(__name__)
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

USERS: dict[str, dict] = {
    "owner.northeast@example-pizza.com": {
        "name": "Mike Romano", "role": "franchise_owner", "region": "Northeast",
        "password_hash": "pbkdf2:sha256:existing_hash_ne", "active": True,
    },
    "owner.southeast@example-pizza.com": {
        "name": "Lisa Chen", "role": "franchise_owner", "region": "Southeast",
        "password_hash": "pbkdf2:sha256:existing_hash_se", "active": True,
    },
    "owner.midwest@example-pizza.com": {
        "name": "James Park", "role": "franchise_owner", "region": "Midwest",
        "password_hash": "pbkdf2:sha256:existing_hash_mw", "active": True,
    },
    "owner.west@example-pizza.com": {
        "name": "Sarah Gonzalez", "role": "franchise_owner", "region": "West",
        "password_hash": "pbkdf2:sha256:existing_hash_w", "active": True,
    },
    "admin@example-pizza.com": {
        "name": "System Admin", "role": "admin", "region": "HQ",
        "password_hash": "pbkdf2:sha256:existing_hash_admin", "active": True,
    },
}

RESET_LOG: list[dict] = []

@app.get("/")
def index() -> str:
    return (
        "<h1>Pizza Franchise Auth Portal</h1>"
        "<p>Franchise owner authentication service.</p>"
        "<p>Endpoints: POST /auth/register, POST /auth/forgot-password</p>"
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
    USERS[email] = {
        "name": name, "role": "user", "region": "test",
        "password_hash": f"pbkdf2:sha256:{secrets.token_hex(16)}", "active": True,
    }
    return jsonify({"registered": email, "name": name}), 201

@app.post("/auth/forgot-password")
def forgot_password() -> tuple:
    data = request.get_json(force=True, silent=True) or {}
    email = data.get("email", "")
    if not email:
        return jsonify({"error": "email required"}), 400
    if email not in USERS:
        return jsonify({"error": "email not found"}), 404

    reset_token = secrets.token_hex(32)
    old_hash = USERS[email]["password_hash"]
    USERS[email]["password_hash"] = f"pbkdf2:sha256:INVALIDATED_{secrets.token_hex(8)}"
    RESET_LOG.append({
        "email": email,
        "name": USERS[email]["name"],
        "role": USERS[email]["role"],
        "reset_token": reset_token,
        "old_password_invalidated": True,
        "timestamp": datetime.now(UTC).isoformat(),
    })
    return jsonify({
        "success": True,
        "message": f"Password reset email sent to {email}",
        "flag": FLAG,
    }), 200

@app.get("/api/users")
def list_users() -> tuple:
    return jsonify([
        {"email": e, "name": d["name"], "role": d["role"], "region": d["region"]}
        for e, d in USERS.items()
    ]), 200

@app.get("/api/reset-log")
def reset_log() -> tuple:
    return jsonify(RESET_LOG), 200

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
