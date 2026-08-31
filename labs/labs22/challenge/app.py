from __future__ import annotations

import os
import secrets

from flask import Flask, jsonify, request

app = Flask(__name__)
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

TOKENS: dict[str, dict] = {}
USERS: dict[str, dict] = {}
NEXT_NOTE = 3

ACCOUNT = 32  # single shared account scope (as in the source finding)

NOTES = [
    {"id": 1, "account_id": ACCOUNT, "author_role": "admin", "author_email": "soc@sentinelops",
     "content": f"Escalation runbook note: master rotation secret is {FLAG} - keep internal.",
     "system": True},
    {"id": 2, "account_id": ACCOUNT, "author_role": "system", "author_email": "svc-audit@sentinelops",
     "content": "Baseline configuration snapshot taken 2026-01-04.", "system": True},
]

# ------------------------------------------------------------------
# Org-wide settings — the priority threshold is presented as read-only
# in the UI, but the API accepts writes.
# ------------------------------------------------------------------
SETTINGS = {"priority_threshold": 50}

def current_user():
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    return TOKENS.get(token)

@app.get("/")
def index():
    return ("<h1>SentinelOps</h1><p>Security operations notes for account "
            f"#{ACCOUNT}.</p>"
            "<!-- API: POST /auth/register, POST /auth/login, GET /api/accounts/32/notes,"
            " PATCH /api/accounts/32/notes/<id>, GET /api/app/settings,"
            " POST /api/app/priority-entities/threshold-score -->")

@app.post("/auth/register")
def register():
    d = request.get_json(force=True, silent=True) or {}
    email = (d.get("email") or "").strip()
    password = d.get("password") or ""
    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    if email in USERS:
        return jsonify({"error": "email already registered"}), 409
    user = {"email": email, "password": password, "role": "analyst"}
    USERS[email] = user
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return jsonify({"token": token, "role": "analyst", "account_id": ACCOUNT}), 201

@app.post("/auth/login")
def login():
    d = request.get_json(force=True, silent=True) or {}
    user = USERS.get((d.get("email") or "").strip())
    if not user or user["password"] != (d.get("password") or ""):
        return jsonify({"error": "invalid credentials"}), 401
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return jsonify({"token": token, "role": user["role"], "account_id": ACCOUNT}), 200

# ------------------------------------------------------------------
# Note listing. System/admin notes are masked for non-authors and
# explicitly flagged canEdit: false — the UI honors this, the API does
# not (see PATCH below).
# ------------------------------------------------------------------
@app.get("/api/accounts/<int:acct>/notes")
def list_notes(acct):
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    items = []
    for n in NOTES:
        owner = n["author_email"] == u["email"]
        items.append({
            "id": n["id"],
            "author_role": n["author_role"],
            "content": n["content"] if owner else "\u2022" * 8,
            "canEdit": owner,
        })
    return jsonify({"account_id": acct, "total": len(items), "items": items}), 200

# ------------------------------------------------------------------
# Note update. No ownership or canEdit enforcement — the response even
# echoes the unmasked previous content back to the caller.
# ------------------------------------------------------------------
@app.patch("/api/accounts/<int:acct>/notes/<int:nid>")
def update_note(acct, nid):
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    d = request.get_json(force=True, silent=True) or {}
    new_note = (d.get("note") or "").strip()
    if not new_note:
        return jsonify({"error": "note required"}), 400
    note = next((n for n in NOTES if n["id"] == nid and n["account_id"] == acct), None)
    if not note:
        return jsonify({"error": "not found"}), 404
    previous = note["content"]
    note["content"] = new_note
    return jsonify({"updated": nid, "previous": previous, "note": new_note}), 200

@app.post("/api/accounts/<int:acct>/notes")
def create_note(acct):
    global NEXT_NOTE
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    d = request.get_json(force=True, silent=True) or {}
    content = (d.get("note") or "").strip()
    if not content:
        return jsonify({"error": "note required"}), 400
    note = {"id": NEXT_NOTE, "account_id": acct, "author_role": u["role"],
            "author_email": u["email"], "content": content, "system": False}
    NOTES.append(note)
    NEXT_NOTE += 1
    return jsonify({"created": note["id"], "canEdit": True}), 201

# ------------------------------------------------------------------
# Settings: the threshold is ui_editable: false, but the write endpoint
# below accepts any authenticated caller.
# ------------------------------------------------------------------
@app.get("/api/app/settings")
def get_settings():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({"priority_threshold": SETTINGS["priority_threshold"],
                    "ui_editable": False}), 200

@app.post("/api/app/priority-entities/threshold-score")
def set_threshold():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    d = request.get_json(force=True, silent=True) or {}
    score = d.get("threshold_score")
    if not isinstance(score, (int, float)) or not (0 <= score <= 1000):
        return jsonify({"error": "threshold_score (0-1000) required"}), 400
    SETTINGS["priority_threshold"] = score
    return jsonify({"success": True, "priority_threshold": score}), 200

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
