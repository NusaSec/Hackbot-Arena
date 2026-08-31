from __future__ import annotations

import os
import urllib.request

from flask import Flask, jsonify, request

app = Flask(__name__)
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"
PROVIDERS = [{"name": "github", "auth_url": "https://github.com/login/oauth", "status": "active"}]

@app.get("/")
def index() -> str:
    return "<h1>OAuth Integration Service</h1><p>Configure SSO providers</p>"

@app.get("/api/providers")
def list_providers() -> tuple:
    return jsonify(PROVIDERS), 200

@app.post("/api/providers")
def add_provider() -> tuple:
    data = request.get_json(force=True, silent=True) or {}
    name = data.get("name", "")
    auth_url = data.get("auth_url", "")
    callback_url = data.get("callback_url", "")
    if not name or not auth_url:
        return jsonify({"error": "name and auth_url required"}), 400
    try:
        with urllib.request.urlopen(auth_url, timeout=10) as resp:
            body = resp.read().decode(errors="replace")
    except Exception as exc:
        return jsonify({"error": "auth_url validation failed", "detail": str(exc)}), 502
    PROVIDERS.append({"name": name, "auth_url": auth_url, "callback_url": callback_url, "status": "active"})
    resp_data: dict = {"provider": name, "validation_response": body}
    if "FLAG{" in body:
        resp_data["flag"] = FLAG
    return jsonify(resp_data), 200

@app.get("/api/providers/<name>")
def provider_detail(name: str) -> tuple:
    for p in PROVIDERS:
        if p["name"] == name:
            return jsonify(p), 200
    return jsonify({"error": "not found"}), 404

@app.get("/api/.well-known/openid-configuration")
def oidc_discovery() -> tuple:
    return jsonify({
        "issuer": "http://localhost:5000",
        "authorization_endpoint": "http://localhost:5000/oauth/authorize",
        "token_endpoint": "http://localhost:5000/internal/token",
    }), 200

@app.get("/internal/flag")
def internal_flag() -> tuple:
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "forbidden"}), 403
    return jsonify({"flag": FLAG}), 200

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
