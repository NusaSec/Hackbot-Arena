from __future__ import annotations

import os
import sqlite3
from functools import wraps

import jwt
from flask import Flask, jsonify, request

app = Flask(__name__)
JWT_SECRET = "sb-adtech-admin-secret-3f7c"
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"
USERS_DICT = {
    "admin": ("admin123", "admin"),
    "analyst": ("analyst123", "analyst"),
    "user1": ("pass1", "user"),
    "user2": ("pass2", "user"),
    "user3": ("pass3", "user"),
}

DB = sqlite3.connect(":memory:")
DB.row_factory = sqlite3.Row
DB.executescript(
    "CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT UNIQUE,password TEXT,role TEXT);"
    "CREATE TABLE groups(id INTEGER PRIMARY KEY,name TEXT,members TEXT);"
)
for i, (u, (pw, role)) in enumerate(USERS_DICT.items(), 1):
    DB.execute("INSERT INTO users VALUES(?,?,?,?)", (i, u, pw, role))
for gid, name, members in [
    (1, "Campaign-Alpha", "1,2"),
    (2, "Campaign-Beta", "2,3"),
    (3, "Campaign-Gamma", "1,3"),
]:
    DB.execute("INSERT INTO groups VALUES(?,?,?)", (gid, name, members))
DB.commit()

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
    return "<h1>AdTech IAM</h1><p>POST /auth/login to get a token.</p>"

@app.post("/auth/login")
def login() -> tuple:
    data = request.get_json(force=True, silent=True) or {}
    u, p = data.get("username", ""), data.get("password", "")
    if u not in USERS_DICT or USERS_DICT[u][0] != p:
        return jsonify({"error": "invalid credentials"}), 401
    token = jwt.encode({"username": u, "role": USERS_DICT[u][1]}, JWT_SECRET, algorithm="HS256")
    return jsonify({"token": token}), 200

@app.get("/api/users")
@require_auth
def list_users() -> tuple:
    rows = DB.execute("SELECT id, username, role FROM users").fetchall()
    return jsonify([dict(r) for r in rows]), 200

@app.get("/api/users/<int:uid>")
@require_auth
def user_detail(uid: int) -> tuple:
    row = DB.execute("SELECT id, username, role FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify(dict(row)), 200

@app.post("/api/users")
@require_auth
def create_user() -> tuple:
    data = request.get_json(force=True, silent=True) or {}
    username = data.get("username", "")
    role = data.get("role", "user")
    if not username:
        return jsonify({"error": "username required"}), 400
    try:
        DB.execute("INSERT INTO users(username,password,role) VALUES(?,?,?)", (username, "test", role))
        DB.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username taken"}), 409
    return jsonify({"created": username, "role": role, "flag": FLAG}), 201

@app.put("/api/users/<int:uid>")
@require_auth
def update_user(uid: int) -> tuple:
    if not DB.execute("SELECT id FROM users WHERE id=?", (uid,)).fetchone():
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True, silent=True) or {}
    if "role" in data:
        DB.execute("UPDATE users SET role=? WHERE id=?", (data["role"], uid))
        DB.commit()
    return jsonify({"updated": uid, "flag": FLAG}), 200

@app.delete("/api/users/<int:uid>")
@require_auth
def delete_user(uid: int) -> tuple:
    if not DB.execute("SELECT id FROM users WHERE id=?", (uid,)).fetchone():
        return jsonify({"error": "not found"}), 404
    DB.execute("DELETE FROM users WHERE id=?", (uid,))
    DB.commit()
    return jsonify({"deleted": uid, "flag": FLAG}), 200

@app.get("/api/groups")
@require_auth
def list_groups() -> tuple:
    rows = DB.execute("SELECT * FROM groups").fetchall()
    return jsonify([dict(r) for r in rows]), 200

@app.get("/api/groups/<int:gid>")
@require_auth
def group_detail(gid: int) -> tuple:
    row = DB.execute("SELECT * FROM groups WHERE id=?", (gid,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify(dict(row)), 200

@app.delete("/api/groups/<int:gid>")
@require_auth
def delete_group(gid: int) -> tuple:
    if not DB.execute("SELECT id FROM groups WHERE id=?", (gid,)).fetchone():
        return jsonify({"error": "not found"}), 404
    DB.execute("DELETE FROM groups WHERE id=?", (gid,))
    DB.commit()
    return jsonify({"deleted": gid, "flag": FLAG}), 200

@app.get("/api/admin/config")
@require_auth
def admin_config() -> tuple:
    return jsonify({"platform": "AdTech IAM"}), 200

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
        app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), threaded=False)
