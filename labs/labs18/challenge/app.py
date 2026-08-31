from __future__ import annotations

import os
import sqlite3
from functools import wraps

import jwt
from flask import Flask, jsonify, request

app = Flask(__name__)
JWT_SECRET = "sb-team-workspace-secret-2b7a"
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"
_SEED = [("alice", "alice@co.com"), ("bob", "bob@co.com"), ("carol", "carol@co.com"),
         ("dave", "dave@co.com"), ("eve", "eve@co.com"), ("frank", "frank@co.com"),
         ("grace", "grace@co.com"), ("heidi", "heidi@co.com"), ("ivan", "ivan@co.com"), ("judy", "judy@co.com")]

DB = sqlite3.connect(":memory:")
DB.row_factory = sqlite3.Row
DB.executescript(
    "CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT UNIQUE,password TEXT,email TEXT);"
    "CREATE TABLE groups(id INTEGER PRIMARY KEY,owner_id INTEGER,name TEXT);"
    "CREATE TABLE members(group_id INTEGER,user_id INTEGER,UNIQUE(group_id,user_id));")
for _i, (_u, _e) in enumerate(_SEED, 1):
    DB.execute("INSERT INTO users VALUES(?,?,?,?)", (_i, _u, "seedpass", _e))
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

def _token(uid, username):
    return jwt.encode({"user_id": uid, "username": username}, JWT_SECRET, algorithm="HS256")

@app.get("/")
def index(): return "<h1>TeamWorkspace</h1><p>POST /auth/register or /auth/login</p>"

@app.post("/auth/register")
def register():
    d = request.get_json(force=True, silent=True) or {}
    u, p = d.get("username", ""), d.get("password", "")
    if not u or not p:
        return jsonify({"error": "username and password required"}), 400
    try:
        cur = DB.execute("INSERT INTO users(username,password,email) VALUES(?,?,?)", (u, p, f"{u}@test.com"))
        DB.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username taken"}), 409
    return jsonify({"token": _token(cur.lastrowid, u)}), 201

@app.post("/auth/login")
def login():
    d = request.get_json(force=True, silent=True) or {}
    row = DB.execute("SELECT * FROM users WHERE username=? AND password=?",
                     (d.get("username", ""), d.get("password", ""))).fetchone()
    if not row:
        return jsonify({"error": "invalid credentials"}), 401
    return jsonify({"token": _token(row["id"], row["username"])}), 200

@app.get("/api/users")
@require_auth
def list_users():
    rows = DB.execute("SELECT id, username, email FROM users").fetchall()
    return jsonify([dict(r) for r in rows]), 200

@app.post("/api/groups")
@require_auth
def create_group():
    d = request.get_json(force=True, silent=True) or {}
    uid = request.current_user["user_id"]
    cur = DB.execute("INSERT INTO groups(owner_id,name) VALUES(?,?)", (uid, d.get("name", "untitled")))
    DB.commit()
    return jsonify({"group_id": cur.lastrowid}), 201

@app.post("/api/groups/<int:gid>/members")
@require_auth
def add_member(gid):
    d = request.get_json(force=True, silent=True) or {}
    if not d.get("user_id"):
        return jsonify({"error": "user_id required"}), 400
    if not DB.execute("SELECT * FROM groups WHERE id=?", (gid,)).fetchone():
        return jsonify({"error": "group not found"}), 404
    try:
        DB.execute("INSERT INTO members VALUES(?,?)", (gid, d["user_id"]))
        DB.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "already a member"}), 409
    members = [r["user_id"] for r in DB.execute("SELECT user_id FROM members WHERE group_id=?", (gid,)).fetchall()]
    resp = {"members": members, "milestone": FLAG} if len(members) >= 3 else {"members": members}
    return jsonify(resp), 200

@app.get("/api/groups/<int:gid>")
@require_auth
def group_detail(gid):
    grp = DB.execute("SELECT * FROM groups WHERE id=?", (gid,)).fetchone()
    if not grp:
        return jsonify({"error": "not found"}), 404
    members = [r["user_id"] for r in DB.execute("SELECT user_id FROM members WHERE group_id=?", (gid,)).fetchall()]
    return jsonify({"group": dict(grp), "members": members}), 200

@app.get("/health")
def health(): return {"status": "ok"}

if __name__ == "__main__":
        app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), threaded=False)
