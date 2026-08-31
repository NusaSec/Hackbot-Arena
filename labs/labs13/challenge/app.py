from __future__ import annotations

import os
from functools import wraps

import jwt
from flask import Flask, jsonify, request

app = Flask(__name__)
JWT_SECRET = "sb-project-board-secret-9f3a"
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

USERS = {"admin": ("admin123", "admin"), "viewer": ("viewer123", "viewer")}
_next_id = 4
PROJECTS = {
    1: {"id": 1, "name": "Website Redesign", "status": "active"},
    2: {"id": 2, "name": "Mobile App", "status": "active"},
    3: {"id": 3, "name": "Data Migration", "status": "completed"},
}

def require_auth(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ")
        try:
            request.current_user = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.PyJWTError:
            return jsonify({"error": "invalid or missing token"}), 401
        return fn(*a, **kw)
    return wrapper

@app.get("/")
def index() -> str:
    return "<h1>ProjectBoard API</h1><p>POST /auth/login to get a token.</p>"

@app.post("/auth/login")
def login() -> tuple:
    data = request.get_json(force=True, silent=True) or {}
    username = data.get("username", "")
    password = data.get("password", "")
    if username not in USERS or USERS[username][0] != password:
        return jsonify({"error": "invalid credentials"}), 401
    token = jwt.encode(
        {"username": username, "role": USERS[username][1]}, JWT_SECRET, algorithm="HS256"
    )
    return jsonify({"token": token}), 200

@app.get("/api/projects")
@require_auth
def list_projects() -> tuple:
    return jsonify(list(PROJECTS.values())), 200

@app.get("/api/projects/<int:pid>")
@require_auth
def project_detail(pid: int) -> tuple:
    if pid not in PROJECTS:
        return jsonify({"error": "not found"}), 404
    return jsonify(PROJECTS[pid]), 200

@app.post("/api/projects")
@require_auth
def create_project() -> tuple:
    global _next_id  # noqa: PLW0603
    data = request.get_json(force=True, silent=True) or {}
    name = data.get("name", "Untitled")
    status = data.get("status", "active")
    project = {"id": _next_id, "name": name, "status": status}
    PROJECTS[_next_id] = project
    _next_id += 1
    return jsonify({"project": project, "flag": FLAG}), 201

@app.put("/api/projects/<int:pid>")
@require_auth
def update_project(pid: int) -> tuple:
    if pid not in PROJECTS:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True, silent=True) or {}
    if "name" in data:
        PROJECTS[pid]["name"] = data["name"]
    if "status" in data:
        PROJECTS[pid]["status"] = data["status"]
    return jsonify({"project": PROJECTS[pid], "flag": FLAG}), 200

@app.delete("/api/projects/<int:pid>")
@require_auth
def delete_project(pid: int) -> tuple:
    if pid not in PROJECTS:
        return jsonify({"error": "not found"}), 404
    del PROJECTS[pid]
    return jsonify({"deleted": pid, "flag": FLAG}), 200

@app.get("/api/admin/users")
@require_auth
def admin_users() -> tuple:
    user_list = [{"username": u, "role": r[1]} for u, r in USERS.items()]
    return jsonify({"users": user_list}), 200

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
