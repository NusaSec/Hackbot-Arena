from __future__ import annotations

import os
import secrets
import subprocess

from flask import Flask, jsonify, request

app = Flask(__name__)
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

TOKENS: dict[str, dict] = {}
USERS: dict[str, dict] = {}
EXPORTS: dict[str, dict] = {}

SCOPES = {"suppliers", "inventory", "bills"}

def current_user():
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    return TOKENS.get(token)

@app.get("/")
def index():
    return ("<h1>InvenTrack</h1><p>Inventory &amp; supplier management.</p>"
            "<!-- Export API: POST /exporting/v1/exports,"
            " GET /exporting/v1/exports/<id> -->")

@app.post("/auth/register")
def register():
    d = request.get_json(force=True, silent=True) or {}
    email = (d.get("email") or "").strip()
    password = d.get("password") or ""
    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    if email in USERS:
        return jsonify({"error": "email already registered"}), 409
    user = {"email": email, "password": password, "role": "buyer"}
    USERS[email] = user
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return jsonify({"token": token, "role": "buyer"}), 201

@app.post("/auth/login")
def login():
    d = request.get_json(force=True, silent=True) or {}
    user = USERS.get((d.get("email") or "").strip())
    if not user or user["password"] != (d.get("password") or ""):
        return jsonify({"error": "invalid credentials"}), 401
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return jsonify({"token": token, "role": user["role"]}), 200

# ------------------------------------------------------------------
# Export worker: builds the output file by shelling out. The requested
# output file name is interpolated into the command with no validation
# or escaping — shell metacharacters execute verbatim. The job record
# exposes the command's stdout/stderr to the caller.
# ------------------------------------------------------------------
@app.post("/exporting/v1/exports")
def create_export():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    d = request.get_json(force=True, silent=True) or {}
    scope = d.get("scope", "suppliers")
    if scope not in SCOPES:
        return jsonify({"error": "unknown scope"}), 400
    fn = ((d.get("additional") or {}).get("outputFileName") or "report.csv").strip()
    if not fn:
        return jsonify({"error": "outputFileName required"}), 400
    export_id = secrets.token_hex(8)
    cmd = f"cp /app/report_template.csv /app/exports/{fn}"
    try:
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
        record = {"status": "completed", "scope": scope, "outputFileName": fn,
                  "exit_code": proc.returncode,
                  "logs": {"stdout": proc.stdout, "stderr": proc.stderr}}
    except subprocess.TimeoutExpired:
        record = {"status": "failed", "scope": scope, "outputFileName": fn,
                  "exit_code": -1, "logs": {"stdout": "", "stderr": "timeout"}}
    EXPORTS[export_id] = record
    return jsonify({"exportId": export_id, "status": record["status"],
                    "statusUrl": f"/exporting/v1/exports/{export_id}"}), 201

@app.get("/exporting/v1/exports/<export_id>")
def export_status(export_id):
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    record = EXPORTS.get(export_id)
    if not record:
        return jsonify({"error": "export not found"}), 404
    return jsonify(record), 200

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    os.makedirs("/app/exports", exist_ok=True)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
