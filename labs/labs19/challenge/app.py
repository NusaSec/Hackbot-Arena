from __future__ import annotations

import os
import secrets

from flask import Flask, jsonify, request

app = Flask(__name__)
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

# ------------------------------------------------------------------
# Tenants
# ------------------------------------------------------------------
ORGS = {"org_acme": "Acme Corp", "org_globex": "Globex Inc"}

TOKENS: dict[str, dict] = {}
USERS: dict[str, dict] = {}

# ------------------------------------------------------------------
# Vendor directory (per-tenant) and approved bill payments
# ------------------------------------------------------------------
VENDORS = [
    {"id": "vend_9f2a01", "org": "org_acme", "name": "Office Depot",
     "category": "office-supplies", "status": "active", "year_to_date_spend": 4820},
    {"id": "vend_9f2a02", "org": "org_acme", "name": "Lyft Business",
     "category": "transport", "status": "active", "year_to_date_spend": 1226},
    {"id": "vend_7c11aa", "org": "org_globex", "name": "Initech Systems",
     "category": "consulting", "status": "active", "year_to_date_spend": 91500},
    {"id": "vend_7c11ab", "org": "org_globex", "name": "Umbrella Logistics",
     "category": "logistics", "status": "active", "year_to_date_spend": 23750},
]

PAYMENTS = {
    "vend_9f2a01": {
        "vendorId": "vend_9f2a01", "totalAmount": 4820.0, "readableStatus": "Approved",
        "billingAccountObj": {"accountName": "Acme Corp - Operations", "glCode": "6100-OPS"},
        "vendorBankAccountObj": {"bankName": "Civic Trust Bank", "accountNumber": "****1187",
                                 "routingNumber": "****6621", "plaintext_routing_number": "071000013"},
    },
    "vend_9f2a02": {
        "vendorId": "vend_9f2a02", "totalAmount": 1226.0, "readableStatus": "Approved",
        "billingAccountObj": {"accountName": "Acme Corp - Travel", "glCode": "6200-TRV"},
        "vendorBankAccountObj": {"bankName": "Civic Trust Bank", "accountNumber": "****2249",
                                 "routingNumber": "****7734", "plaintext_routing_number": "071000013"},
    },
    "vend_7c11aa": {
        "vendorId": "vend_7c11aa", "totalAmount": 91500.0, "readableStatus": "Approved",
        "billingAccountObj": {"accountName": "Globex Inc - Consulting", "glCode": "6300-CON"},
        "vendorBankAccountObj": {"bankName": "First Gresham Bank", "accountNumber": "****4471",
                                 "routingNumber": "****9021", "plaintext_routing_number": FLAG},
    },
    "vend_7c11ab": {
        "vendorId": "vend_7c11ab", "totalAmount": 23750.0, "readableStatus": "Approved",
        "billingAccountObj": {"accountName": "Globex Inc - Logistics", "glCode": "6400-LOG"},
        "vendorBankAccountObj": {"bankName": "First Gresham Bank", "accountNumber": "****5583",
                                 "routingNumber": "****1145", "plaintext_routing_number": "071000301"},
    },
}

# ------------------------------------------------------------------
# Auth
# ------------------------------------------------------------------
def current_user():
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    return TOKENS.get(token)

@app.get("/")
def index():
    return ("<h1>SpendGate</h1><p>Multi-company spend management.</p>"
            "<!-- API: POST /auth/register, POST /auth/login, GET /api/me,"
            " GET /api/vendors, POST /api/vendors/find_paginated,"
            " GET /api/bills/get_most_recently_approved_bill_payment_for_vendor?vendorId= -->")

@app.post("/auth/register")
def register():
    d = request.get_json(force=True, silent=True) or {}
    email = (d.get("email") or "").strip()
    password = d.get("password") or ""
    name = (d.get("name") or "New Employee").strip()
    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    if email in USERS:
        return jsonify({"error": "email already registered"}), 409
    user = {"email": email, "name": name, "password": password,
            "org": "org_acme", "role": "employee"}
    USERS[email] = user
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return jsonify({"token": token, "org": ORGS["org_acme"], "role": "employee"}), 201

@app.post("/auth/login")
def login():
    d = request.get_json(force=True, silent=True) or {}
    user = USERS.get((d.get("email") or "").strip())
    if not user or user["password"] != (d.get("password") or ""):
        return jsonify({"error": "invalid credentials"}), 401
    token = secrets.token_hex(24)
    TOKENS[token] = user
    return jsonify({"token": token, "org": ORGS[user["org"]], "role": user["role"]}), 200

@app.get("/api/me")
def me():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({"email": u["email"], "name": u["name"],
                    "org": ORGS[u["org"]], "role": u["role"]}), 200

# ------------------------------------------------------------------
# Vendor listing (properly scoped)
# ------------------------------------------------------------------
@app.get("/api/vendors")
def vendors():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    items = [{k: v[k] for k in ("id", "name", "category", "status", "year_to_date_spend")}
             for v in VENDORS if v["org"] == u["org"]]
    return jsonify({"total": len(items), "items": items}), 200

# ------------------------------------------------------------------
# Paginated vendor search with an RQL condition.
#
# The tenant scope is prepended to the user-supplied condition and the
# combined expression is evaluated per record. Because the scope clause
# is joined without wrapping parentheses, a condition containing a
# top-level OR breaks out of the tenant filter (see solver/README.md).
#
# Conditions are evaluated by the minimal grammar below — comparisons
# between fields, numbers and quoted strings joined by && / || — never
# by evaluating the text as code.
# ------------------------------------------------------------------
FIELDS = ("id", "org", "name", "category", "status", "year_to_date_spend")

class RqlError(Exception):
    pass

def _lex(src):
    toks, i = [], 0
    while i < len(src):
        c = src[i]
        if c.isspace():
            i += 1
            continue
        for op in ("==", "!=", ">=", "<=", "&&", "||"):
            if src.startswith(op, i):
                toks.append(("op", op))
                i += len(op)
                break
        else:
            if c in "()<>" :
                toks.append(("op", c))
                i += 1
            elif c == "'":
                j = src.find("'", i + 1)
                if j < 0:
                    raise RqlError("unterminated string")
                toks.append(("str", src[i + 1:j]))
                i = j + 1
            elif c.isdigit() or (c == "." and i + 1 < len(src) and src[i + 1].isdigit()):
                j = i
                while j < len(src) and (src[j].isdigit() or src[j] == "."):
                    j += 1
                text = src[i:j]
                if text.count(".") > 1:
                    raise RqlError("malformed number")
                try:
                    toks.append(("num", float(text) if "." in text else int(text)))
                except ValueError:
                    raise RqlError("malformed number")
                i = j
            elif c.isalpha() or c == "_":
                j = i
                while j < len(src) and (src[j].isalnum() or src[j] == "_"):
                    j += 1
                toks.append(("id", src[i:j]))
                i = j
            else:
                raise RqlError(f"unexpected character {c!r}")
    return toks

MAX_RQL_LEN = 256
MAX_RQL_DEPTH = 32

def _parse(toks):
    pos = [0]
    depth = [0]

    def peek():
        return toks[pos[0]] if pos[0] < len(toks) else (None, None)

    def take():
        tok = peek()
        pos[0] += 1
        return tok

    def operand():
        kind, val = take()
        if kind in ("str", "num", "id"):
            return (kind, val)
        raise RqlError("expected value")

    def primary():
        kind, val = peek()
        if kind == "op" and val == "(":
            depth[0] += 1
            if depth[0] > MAX_RQL_DEPTH:
                raise RqlError("expression nests too deeply")
            take()
            node = or_expr()
            kind, val = take()
            depth[0] -= 1
            if (kind, val) != ("op", ")"):
                raise RqlError("expected )")
            return node
        left = operand()
        kind, val = take()
        if kind != "op" or val not in ("==", "!=", ">=", "<=", ">", "<"):
            raise RqlError("expected comparison operator")
        right = operand()
        return ("cmp", val, left, right)

    def and_expr():
        node = primary()
        while peek() == ("op", "&&"):
            take()
            node = ("and", node, primary())
        return node

    def or_expr():
        node = and_expr()
        while peek() == ("op", "||"):
            take()
            node = ("or", node, and_expr())
        return node

    node = or_expr()
    if pos[0] != len(toks):
        raise RqlError("trailing tokens")
    return node

def _resolve(term, record):
    kind, val = term
    if kind == "id":
        if val not in FIELDS:
            raise RqlError(f"unknown field {val!r}")
        return record[val]
    return val

def _eval(node, record):
    tag = node[0]
    if tag == "or":
        return _eval(node[1], record) or _eval(node[2], record)
    if tag == "and":
        return _eval(node[1], record) and _eval(node[2], record)
    _, op, left, right = node
    a, b = _resolve(left, record), _resolve(right, record)
    try:
        if op == "==":
            return a == b
        if op == "!=":
            return a != b
        if op == ">":
            return a > b
        if op == "<":
            return a < b
        if op == ">=":
            return a >= b
        return a <= b
    except TypeError:
        return False

def eval_rql(rql: str, user: dict, record: dict):
    combined = f"org == '{user['org']}' && {rql}"
    try:
        ast = _parse(_lex(combined))
        return bool(_eval(ast, record))
    except (RqlError, ValueError, RecursionError):
        return None

@app.post("/api/vendors/find_paginated")
def find_paginated():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    d = request.get_json(force=True, silent=True) or {}
    rql = (d.get("rql_condition") or "").strip()
    if not rql:
        return jsonify({"error": "rql_condition required"}), 400
    if len(rql) > MAX_RQL_LEN:
        return jsonify({"error": "rql_condition too long"}), 400
    items = []
    for v in VENDORS:
        ok = eval_rql(rql, u, v)
        if ok is None:
            return jsonify({"error": "invalid rql_condition"}), 400
        if ok:
            items.append({k: v[k] for k in ("id", "org", "name", "category", "year_to_date_spend")})
    return jsonify({"total": len(items), "items": items}), 200

# ------------------------------------------------------------------
# Most recent approved payment for a vendor.
#
# Returns full payment details (including vendor bank objects) and never
# checks that the vendor belongs to the caller's company — BOLA.
# ------------------------------------------------------------------
@app.get("/api/bills/get_most_recently_approved_bill_payment_for_vendor")
def payment_for_vendor():
    u = current_user()
    if not u:
        return jsonify({"error": "unauthorized"}), 401
    vendor_id = request.args.get("vendorId", "")
    if not vendor_id:
        return jsonify({"error": "vendorId required"}), 400
    payment = PAYMENTS.get(vendor_id)
    if not payment:
        return jsonify({"error": "no approved payment for vendor"}), 404
    return jsonify(payment), 200

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
