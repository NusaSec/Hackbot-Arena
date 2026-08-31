from __future__ import annotations

import os
import urllib.request

from flask import Flask, jsonify, request

app = Flask(__name__)
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

@app.get("/")
def index() -> str:
    return "<h1>Proxy Gateway</h1><!-- API: POST /api/fetch, GET /api/status -->"

@app.get("/api/status")
def status() -> dict:
    return {"service": "proxy-gateway", "version": "2.4.1", "uptime": "14d 3h"}

@app.post("/api/fetch")
def fetch() -> tuple:
    data = request.get_json(force=True, silent=True) or {}
    url = data.get("url", "")
    if not url:
        return jsonify({"error": "url required"}), 400
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            body = resp.read().decode(errors="replace")
            return jsonify({"status": resp.status, "body": body}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502

@app.get("/internal/config")
def internal_config() -> tuple:
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "forbidden"}), 403
    return jsonify({"db_host": "postgres.internal", "flag": FLAG}), 200

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
