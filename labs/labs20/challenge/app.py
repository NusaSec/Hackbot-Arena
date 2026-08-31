from __future__ import annotations

import os
import secrets
import sqlite3

from flask import Flask, Response, request

app = Flask(__name__)
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

DB = sqlite3.connect(":memory:", check_same_thread=False)

# ------------------------------------------------------------------
# One table per tenant ("database per tenant" on a shared server).
# The demo tenant is the one self-registered users land in.
# ------------------------------------------------------------------
DB.executescript(
    "CREATE TABLE t_demo_team(id INTEGER PRIMARY KEY, name TEXT, role TEXT);"
    "CREATE TABLE t_northwind_team(id INTEGER PRIMARY KEY, name TEXT, role TEXT);"
    "CREATE TABLE t_globex_team(id INTEGER PRIMARY KEY, name TEXT, role TEXT);"
    "CREATE TABLE t_globex_secrets(id INTEGER PRIMARY KEY, secret_name TEXT, secret_value TEXT);"
)
DB.executemany("INSERT INTO t_demo_team VALUES(?,?,?);", [
    (1, "Demo ReadOnly", "readonly"), (2, "Demo Admin", "admin"),
    (3, "Demo Editor", "editor"), (4, "Demo Support", "support"),
])
DB.executemany("INSERT INTO t_northwind_team VALUES(?,?,?);", [
    (1, "Northwind Owner", "admin"), (2, "Northwind Clerk", "readonly"),
])
DB.executemany("INSERT INTO t_globex_team VALUES(?,?,?);", [
    (1, "Globex Owner", "admin"), (2, "Globex Auditor", "readonly"),
])
DB.executemany("INSERT INTO t_globex_secrets VALUES(?,?,?);", [
    (1, "tenant_api_key", "gx_live_5f2b91c8e4d7a306"),
    (2, "payroll_export_token", FLAG),
    (3, "webhook_signing_secret", "whsec_9d41a7b0c2"),
])
DB.commit()

TOKENS: dict[str, dict] = {}
USERS: dict[str, dict] = {}

PAGE = """<!DOCTYPE html><html><head><title>Meridian Portal</title></head><body>
<h1>{heading}</h1>{body}</body></html>"""

def render_teamaccess(rows, error=None):
    if error is not None:
        body = f'<p class="error">SQL error: {error}</p><p>Failed query fragment near role filter.</p>'
    else:
        tr = "".join(f"<tr><td>{n}</td><td>{r}</td></tr>" for n, r in rows) or "<tr><td colspan='2'>No rows</td></tr>"
        body = (f"<p>{len(rows)} team members shown.</p>"
                f"<table border='1'><tr><th>Name</th><th>Role</th></tr>{tr}</table>")
    return Response(PAGE.format(heading="Team Access", body=body), mimetype="text/html")

def current_user():
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    return TOKENS.get(token)

@app.get("/")
def index():
    return Response(PAGE.format(
        heading="Meridian Portal",
        body="<p>Customer portal (demo tenant).</p>"
             "<!-- Areas: /userprofile/teamaccess/?status=All&role=... -->"),
        mimetype="text/html")

@app.post("/auth/register")
def register():
    d = request.get_json(force=True, silent=True) or {}
    email = (d.get("email") or "").strip()
    password = d.get("password") or ""
    if not email or not password:
        return {"error": "email and password required"}, 400
    if email in USERS:
        return {"error": "email already registered"}, 409
    user = {"email": email, "password": password, "tenant": "demo", "role": "readonly"}
    USERS[email] = user
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return {"token": token, "tenant": "demo", "role": "readonly"}, 201

@app.post("/auth/login")
def login():
    d = request.get_json(force=True, silent=True) or {}
    user = USERS.get((d.get("email") or "").strip())
    if not user or user["password"] != (d.get("password") or ""):
        return {"error": "invalid credentials"}, 401
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return {"token": token, "tenant": user["tenant"], "role": user["role"]}, 200

# ------------------------------------------------------------------
# Team access listing. The role filter is concatenated straight into
# the SQL statement for the caller's tenant table; database errors are
# rendered in the HTML response.
# ------------------------------------------------------------------
@app.get("/userprofile/teamaccess/")
def teamaccess():
    u = current_user()
    if not u:
        return {"error": "unauthorized"}, 401
    role = request.args.get("role", "")
    q = f"SELECT name, role FROM t_{u['tenant']}_team WHERE role = '{role}'"
    try:
        rows = DB.execute(q).fetchall()
    except sqlite3.OperationalError as exc:
        return render_teamaccess([], error=str(exc))
    return render_teamaccess(rows)

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
