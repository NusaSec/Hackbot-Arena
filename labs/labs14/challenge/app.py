from __future__ import annotations

import os

from flask import Flask, jsonify, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

app = Flask(__name__)
limiter = Limiter(key_func=get_remote_address, app=app, storage_uri="memory://")
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

CONNECTORS = {
    "freshdesk": {"type": "freshdesk", "api_url": "https://freshdesk.example.com", "status": "active"},
    "zendesk": {"type": "zendesk", "api_url": "https://zendesk.example.com", "status": "active"},
    "okta": {"type": "okta", "tenant": "acme.okta.com", "status": "active"},
    "slack": {"type": "slack", "webhook_url": "https://hooks.slack.com/services/T000/B000/XXXX", "status": "active"},
}

TEST_API_KEY = "sk_test_connector_9f3a7b2c"

@app.get("/")
def index():
    return "<h1>ServiceConnect</h1><!-- API docs: GET /api/connectors, POST /api/connectors/<type>/test -->"

@app.get("/api/connectors")
def list_connectors():
    return jsonify(list(CONNECTORS.keys())), 200

@app.get("/api/connectors/<ctype>/config")
def connector_config(ctype):
    if ctype not in CONNECTORS:
        return jsonify({"error": "unknown connector"}), 404
    config = dict(CONNECTORS[ctype])
    config["test_api_key"] = TEST_API_KEY
    return jsonify(config), 200

@app.post("/api/connectors/<ctype>/test")
@limiter.limit("3/60second", override_defaults=False)
def test_connector(ctype):
    if ctype not in CONNECTORS:
        return jsonify({"error": "unknown connector"}), 404
    d = request.get_json(force=True, silent=True) or {}
    key = d.get("api_key", "")
    if key != TEST_API_KEY:
        return jsonify({"error": "invalid api_key"}), 401
    return jsonify({"status": "connected", "connector": ctype, "flag": FLAG}), 200

@app.get("/api/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
