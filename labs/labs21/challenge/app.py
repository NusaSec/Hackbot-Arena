from __future__ import annotations

import os
import secrets

from flask import Flask, Response, jsonify, request

app = Flask(__name__)
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

TOKENS: dict[str, dict] = {}
USERS: dict[str, dict] = {}
EXPORTS: dict[str, list[str]] = {}

COMPANIES = {"comp_a": "Acme Corp", "comp_b": "Globex Inc"}

# ------------------------------------------------------------------
# Reimbursement/expense transactions. The shared vendor "Lyft Business"
# is used by both companies. The Globex CFO transaction holds the flag
# in its memo/receipt note.
# ------------------------------------------------------------------
TXNS = [
    {"id": "6f1a01c2d4e5f6a7b8c9d0e1", "company": "comp_a", "vendor": "Lyft Business",
     "employee": "you@example", "amount": 42.10, "memo": "taxi to client site"},
    {"id": "6f1a02c2d4e5f6a7b8c9d0e2", "company": "comp_a", "vendor": "Lyft Business",
     "employee": "you@example", "amount": 18.90, "memo": "airport ride"},
    {"id": "6f1a03c2d4e5f6a7b8c9d0e3", "company": "comp_a", "vendor": "Office Depot",
     "employee": "you@example", "amount": 76.20, "memo": "desk supplies"},
    {"id": "6f1b01c2d4e5f6a7b8c9d0e4", "company": "comp_a", "vendor": "Lyft Business",
     "employee": "cfo@acme", "amount": 310.00, "memo": "executive travel (restricted)"},
    {"id": "6f2a44c2d4e5f6a7b8c9d0f5", "company": "comp_b", "vendor": "Lyft Business",
     "employee": "cfo@globex", "amount": 1540.00,
     "memo": f"board offsite rides - receipt note: {FLAG}"},
    {"id": "6f2a45c2d4e5f6a7b8c9d0f6", "company": "comp_b", "vendor": "Lyft Business",
     "employee": "ops@globex", "amount": 89.50, "memo": "courier rides"},
]

def current_user():
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    return TOKENS.get(token)

@app.get("/")
def index():
    return ("<h1>Expensa</h1><p>Expense reports &amp; reimbursements.</p>"
            "<!-- API: POST /auth/register, POST /auth/login, GET /api/my_transactions,"
            " POST /api/expense_report_transactions/find_paginated,"
            " POST /api/expense_report_transactions/perform_bulk_action,"
            " GET /api/exports/<id> -->")

@app.post("/auth/register")
def register():
    d = request.get_json(force=True, silent=True) or {}
    email = (d.get("email") or "").strip()
    password = d.get("password") or ""
    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    if email in USERS:
        return jsonify({"error": "email already registered"}), 409
    user = {"email": email, "password": password, "company": "comp_a", "role": "employee"}
    USERS[email] = user
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return jsonify({"token": token, "company": COMPANIES["comp_a"], "role": "employee"}), 201

@app.post("/auth/login")
def login():
    d = request.get_json(force=True, silent=True) or {}
    user = USERS.get((d.get("email") or "").strip())
    if not user or user["password"] != (d.get("password") or ""):
        return jsonify({"error": "invalid credentials"}), 401
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return jsonify({"token": token, "company": COMPANIES[user["company"]], "role": user["role"]}), 200

# ------------------------------------------------------------------
# Properly scoped listing: your own transactions only.
# ------------------------------------------------------------------
@app.get("/api/my_transactions")
def my_transactions():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    items = [t for t in TXNS if t["company"] == u["company"] and t["employee"] == u["email"]]
    return jsonify({"total": len(items), "items": items}), 200

# ------------------------------------------------------------------
# Paginated search used by the expense grid. Only IDs are returned —
# but the search runs across every company sharing the vendor, so
# cross-company transaction IDs leak to any caller.
# ------------------------------------------------------------------
@app.post("/api/expense_report_transactions/find_paginated")
def find_paginated():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    d = request.get_json(force=True, silent=True) or {}
    search = ((d.get("paginationParams") or {}).get("searchQuery")
              or d.get("searchQuery") or "").lower()
    if not search:
        return jsonify({"error": "searchQuery required"}), 400
    items = [{"id": t["id"], "vendor": t["vendor"]}
             for t in TXNS if search in t["vendor"].lower()]
    return jsonify({"total": len(items), "items": items}), 200

# ------------------------------------------------------------------
# Bulk export. The includedObjects IDs are never checked against the
# caller's company or permission scope, so any known transaction ID
# can be exported — cross-company included.
# ------------------------------------------------------------------
CSV_HEADER = "id,company,vendor,employee,amount,memo"

@app.post("/api/expense_report_transactions/perform_bulk_action")
def perform_bulk_action():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    d = request.get_json(force=True, silent=True) or {}
    if d.get("actionType") != "BULK_EXPORTING":
        return jsonify({"error": "unsupported actionType"}), 400
    ids = d.get("includedObjects") or []
    if not isinstance(ids, list) or not ids:
        return jsonify({"error": "includedObjects required"}), 400
    by_id = {t["id"]: t for t in TXNS}
    rows = []
    for tid in ids:
        t = by_id.get(str(tid))
        if t:
            memo = t["memo"].replace('"', "'")
            rows.append(f"{t['id']},{COMPANIES[t['company']]},\"{t['vendor']}\","
                        f"{t['employee']},{t['amount']:.2f},\"{memo}\"")
    export_id = secrets.token_hex(12)
    EXPORTS[export_id] = [CSV_HEADER] + rows
    return jsonify({"exportId": export_id, "rowCount": len(rows),
                    "downloadUrl": f"/api/exports/{export_id}"}), 200

@app.get("/api/exports/<export_id>")
def download_export(export_id):
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    rows = EXPORTS.get(export_id)
    if rows is None:
        return jsonify({"error": "export not found"}), 404
    return Response("\n".join(rows) + "\n", mimetype="text/csv")

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
