from __future__ import annotations

import os

from flask import Flask, jsonify, request

app = Flask(__name__)
OTEL_TOKEN = "TBVqht58YTmgrFn6"
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"
TRACES: list[dict] = []
LOGS: list[dict] = []
METRICS: list[dict] = []
INDEX_HTML = """<!DOCTYPE html>
<html><head><title>OTEL Collector</title></head>
<body>
<h1>OpenTelemetry Collector</h1>
<p>Telemetry ingestion service. See /v1/health for endpoint discovery.</p>
<!-- telemetry: b3RlbC1jb2xsZWN0b3ItdG9rZW46VEJWcWh0NThZVG1nckZuNg== -->
</body></html>"""

def _check_auth() -> tuple | None:
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    if token != OTEL_TOKEN:
        return jsonify({"error": "unauthorized"}), 401
    return None

@app.get("/")
def index(): return INDEX_HTML

@app.get("/v1/health")
def health():
    return jsonify({"service": "otel-collector", "version": "0.92.0",
                    "endpoints": ["/v1/traces", "/v1/metrics", "/v1/logs"]}), 200

@app.post("/v1/traces")
def post_traces():
    err = _check_auth()
    if err: return err
    data = request.get_json(force=True, silent=True) or {}
    TRACES.append(data)
    return jsonify({"accepted": True, "flag": FLAG}), 200

@app.post("/v1/logs")
def post_logs():
    err = _check_auth()
    if err: return err
    LOGS.append(request.get_json(force=True, silent=True) or {})
    return jsonify({"accepted": True}), 200

@app.post("/v1/metrics")
def post_metrics():
    err = _check_auth()
    if err: return err
    METRICS.append(request.get_json(force=True, silent=True) or {})
    return jsonify({"accepted": True}), 200

@app.get("/v1/traces")
def get_traces(): return jsonify(TRACES), 200

@app.get("/v1/logs")
def get_logs(): return jsonify(LOGS), 200

@app.get("/v1/metrics")
def get_metrics(): return jsonify(METRICS), 200

@app.get("/health")
def health_root(): return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
