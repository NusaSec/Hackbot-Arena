from __future__ import annotations

import os
import secrets
import urllib.request

from flask import Flask, jsonify, request

app = Flask(__name__)
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"
WEBHOOKS: list[dict] = []

@app.get("/")
def index() -> str:
    return "<h1>Webhook Integration Service</h1><p>Register a webhook to receive notifications</p>"

@app.get("/api/events")
def events() -> tuple:
    return jsonify(["order.created", "order.updated", "user.signup"]), 200

@app.post("/api/echo")
def echo_post() -> tuple:
    data = request.get_data(as_text=True)
    return data, 200

@app.get("/api/echo")
def echo_get() -> tuple:
    return request.args.get("text", ""), 200

@app.post("/api/webhooks")
def register_webhook() -> tuple:
    data = request.get_json(force=True, silent=True) or {}
    url = data.get("url", "")
    event = data.get("event", "")
    if not url or not event:
        return jsonify({"error": "url and event required"}), 400
    token = secrets.token_hex(16)
    try:
        req = urllib.request.Request(url, data=f'{{"challenge": "{token}"}}'.encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode(errors="replace")
    except Exception as exc:
        return jsonify({"error": "webhook verification failed", "detail": str(exc)}), 502
    if token not in body:
        return jsonify({"error": "webhook verification failed", "detail": "challenge mismatch"}), 401
    webhook = {"url": url, "event": event, "verified": True}
    WEBHOOKS.append(webhook)
    return jsonify({"webhook_id": len(WEBHOOKS), "verified": True, "flag": FLAG}), 200

@app.get("/api/webhooks")
def list_webhooks() -> tuple:
    return jsonify(WEBHOOKS), 200

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
