from __future__ import annotations

import os
import secrets

from flask import Flask, Response, jsonify, request
from liquid import Template

app = Flask(__name__)
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

# Render context handed to every page template — includes internal
# objects a template author should never be able to reach from user
# input.
CONFIG = {"app_name": "LiquidPay", "env": "production", "flag": FLAG}

TOKENS: dict[str, dict] = {}
USERS: dict[str, dict] = {}

def current_user():
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    return TOKENS.get(token)

@app.get("/")
def index():
    return ("<h1>LiquidPay</h1><p>Payments profile portal.</p>"
            "<!-- API: POST /auth/register, POST /auth/login, POST /api/profile,"
            " GET /api/profile, GET /change-password -->")

@app.post("/auth/register")
def register():
    d = request.get_json(force=True, silent=True) or {}
    email = (d.get("email") or "").strip()
    password = d.get("password") or ""
    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    if email in USERS:
        return jsonify({"error": "email already registered"}), 409
    user = {
        "email": email,
        "password": password,
        "first_name": (d.get("first_name") or "New").strip(),
        "last_name": (d.get("last_name") or "User").strip(),
    }
    USERS[email] = user
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return jsonify({"token": token}), 201

@app.post("/auth/login")
def login():
    d = request.get_json(force=True, silent=True) or {}
    user = USERS.get((d.get("email") or "").strip())
    if not user or user["password"] != (d.get("password") or ""):
        return jsonify({"error": "invalid credentials"}), 401
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return jsonify({"token": token}), 200

# ------------------------------------------------------------------
# Profile fields are stored exactly as submitted — no validation, no
# length limit, no template-syntax screening.
# ------------------------------------------------------------------
@app.post("/api/profile")
def update_profile():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    d = request.get_json(force=True, silent=True) or {}
    if "first_name" in d:
        u["first_name"] = str(d["first_name"])
    if "last_name" in d:
        u["last_name"] = str(d["last_name"])
    return jsonify({"first_name": u["first_name"], "last_name": u["last_name"]}), 200

@app.get("/api/profile")
def get_profile():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({"email": u["email"], "first_name": u["first_name"],
                    "last_name": u["last_name"]}), 200

# ------------------------------------------------------------------
# The change-password page greets the user by name. The greeting is
# built by feeding the stored profile values straight into the Liquid
# engine — profile input becomes template source.
# ------------------------------------------------------------------
@app.get("/change-password")
def change_password():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    src = (f"<!DOCTYPE html><html><body><h1>Change password</h1>"
           f"<p>Hello, <b>{u['first_name']} {u['last_name']}</b>!</p>"
           f"<p>Please choose a new password for your LiquidPay account.</p>"
           f"</body></html>")
    try:
        html = Template(src).render(config=CONFIG, user={"email": u["email"]})
    except Exception as exc:
        return Response(f"<h1>Change password</h1><p>Template error: {exc}</p>",
                        mimetype="text/html")
    return Response(html, mimetype="text/html")

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
