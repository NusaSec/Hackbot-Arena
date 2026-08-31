from __future__ import annotations

import os

from flask import Flask, jsonify, request

app = Flask(__name__)
DD_RUM_TOKEN = "pub662c2f9a8e1b4d7f3a5c0e"
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"
LOGS: list[dict] = []

INDEX_HTML = f"""<!DOCTYPE html>
<html><head><title>Metrics Dashboard</title></head>
<body>
<h1>Metrics Dashboard</h1>
<script>
  const DD_RUM_TOKEN = "{DD_RUM_TOKEN}";
  // Real User Monitoring initialized with this token
  window.DD_RUM.init({{ clientToken: DD_RUM_TOKEN, applicationId: "app-123" }});
</script>
</body></html>"""

@app.get("/")
def index() -> str:
    return INDEX_HTML

@app.post("/api/logs")
def post_logs() -> tuple:
    data = request.get_json(force=True, silent=True)
    if data is None:
        return jsonify({"error": "invalid JSON"}), 400
    entries = data if isinstance(data, list) else [data]
    LOGS.extend(entries)
    resp: dict = {"ingested": len(entries)}
    for entry in entries:
        if isinstance(entry, dict) and entry.get("token") == DD_RUM_TOKEN:
            resp["flag"] = FLAG
            break
    return jsonify(resp), 200

@app.get("/api/logs")
def get_logs() -> tuple:
    return jsonify(LOGS), 200

@app.get("/api/config")
def get_config() -> tuple:
    return jsonify({"rum_token": DD_RUM_TOKEN, "debug": True}), 200

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
