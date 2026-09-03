import base64
import csv
import hashlib
import hmac
import io
import json
import os
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


PORT = int(os.environ.get("PORT", "5000"))
HOST = os.environ.get("HOST", "0.0.0.0")
TOKEN_SECRET = os.environ.get("TOKEN_SECRET", "ctf-development-secret")
API_KEY = os.environ.get("NUSA_API_KEY", "nusa-public-demo-key-2026")
FLAG = os.environ.get("FLAG", "FLAG{nusasec-768d277c78f5238025e71529ebc123ac}")


USERS = {
    "intern-104": {
        "id": "u-104",
        "attuid": "intern-104",
        "name": "Raka Pratama",
        "role": "analyst",
        "datasets": ["ds-invoice-public-2024", "ds-supplier-scorecard"],
    },
    "finance-ops": {
        "id": "u-220",
        "attuid": "finance-ops",
        "name": "Finance Ops",
        "role": "analyst",
        "datasets": ["ds-invoice-public-2024"],
    },
}


DATASETS = {
    "ds-invoice-public-2024": {
        "dataset_id": "ds-invoice-public-2024",
        "space_id": "space-ap-invoices-open",
        "name": "Regional Invoice Spend",
        "table": "ap_invoice_spend_2024",
        "sensitivity": "internal",
        "schema": [
            "invoice_no",
            "supplier_name",
            "business_unit",
            "invoice_amount_usd",
            "approver",
            "status",
        ],
        "rows": [
            {
                "invoice_no": "INV-2024-1801",
                "supplier_name": "Aruna Logistics",
                "business_unit": "Consumer West",
                "invoice_amount_usd": 18320.50,
                "approver": "Dina Lestari",
                "status": "paid",
            },
            {
                "invoice_no": "INV-2024-1874",
                "supplier_name": "Kencana Fiber",
                "business_unit": "Network Build",
                "invoice_amount_usd": 29104.00,
                "approver": "Bayu Wicaksono",
                "status": "paid",
            },
            {
                "invoice_no": "INV-2024-1902",
                "supplier_name": "Sagara Cloud",
                "business_unit": "Platform",
                "invoice_amount_usd": 7420.75,
                "approver": "Nadia Putri",
                "status": "pending",
            },
            {
                "invoice_no": "INV-2024-1933",
                "supplier_name": "Sentra Catering",
                "business_unit": "People",
                "invoice_amount_usd": 2100.00,
                "approver": "Dina Lestari",
                "status": "paid",
            },
        ],
    },
    "ds-supplier-scorecard": {
        "dataset_id": "ds-supplier-scorecard",
        "space_id": "space-vendor-score-open",
        "name": "Supplier Scorecard",
        "table": "supplier_scorecard",
        "sensitivity": "internal",
        "schema": [
            "supplier_name",
            "risk_rating",
            "on_time_delivery_pct",
            "last_reviewed",
            "category",
        ],
        "rows": [
            {
                "supplier_name": "Aruna Logistics",
                "risk_rating": "medium",
                "on_time_delivery_pct": 94.2,
                "last_reviewed": "2026-07-11",
                "category": "logistics",
            },
            {
                "supplier_name": "Kencana Fiber",
                "risk_rating": "low",
                "on_time_delivery_pct": 98.1,
                "last_reviewed": "2026-08-18",
                "category": "network",
            },
            {
                "supplier_name": "Sagara Cloud",
                "risk_rating": "medium",
                "on_time_delivery_pct": 91.6,
                "last_reviewed": "2026-06-27",
                "category": "software",
            },
        ],
    },
    "ds-board-contracts-legacy": {
        "dataset_id": "ds-board-contracts-legacy",
        "space_id": "space-cdo-board-contracts",
        "name": "Board Contract Register",
        "table": "board_contract_register",
        "sensitivity": "restricted",
        "schema": [
            "contract_id",
            "supplier_name",
            "owner_name",
            "owner_attuid",
            "total_value_usd",
            "status_code",
            "internal_memo",
        ],
        "rows": [
            {
                "contract_id": "CTR-90810",
                "supplier_name": "PT Lintas Satelit",
                "owner_name": "Maya Anggraini",
                "owner_attuid": "maya.a",
                "total_value_usd": 8300000,
                "status_code": "Active",
                "internal_memo": "Renewal under legal review",
            },
            {
                "contract_id": "CTR-91337",
                "supplier_name": "Nusa Core Systems",
                "owner_name": "Reno Mahendra",
                "owner_attuid": "reno.m",
                "total_value_usd": 13370000,
                "status_code": "Active",
                "internal_memo": "Board approval needed",
            },
            {
                "contract_id": "CTR-91990",
                "supplier_name": "Awan Data Center",
                "owner_name": "Sinta Laras",
                "owner_attuid": "sinta.l",
                "total_value_usd": 4200000,
                "status_code": "Draft",
                "internal_memo": "Commercial redlines open",
            },
            {
                "contract_id": "CTR-92004",
                "supplier_name": "Boreal Transit",
                "owner_name": "Damar Santoso",
                "owner_attuid": "damar.s",
                "total_value_usd": 6920000,
                "status_code": "Active",
                "internal_memo": "Migration window locked",
            },
            {
                "contract_id": "CTR-92111",
                "supplier_name": "Khatulistiwa Fiber",
                "owner_name": "Nadia Putri",
                "owner_attuid": "nadia.p",
                "total_value_usd": 2510000,
                "status_code": "Expired",
                "internal_memo": "Archive after audit",
            },
            {
                "contract_id": "CTR-92420",
                "supplier_name": "Komodo Analytics",
                "owner_name": "Bima Oktavian",
                "owner_attuid": "bima.o",
                "total_value_usd": 101000,
                "status_code": "Exception",
                "internal_memo": FLAG,
            },
        ],
    },
}


LEAKED_MEMORIES = [
    {
        "question": "Show every active board contract with owner ATTUID and internal memo",
        "sql_query": (
            "SELECT contract_id, supplier_name, owner_attuid, internal_memo "
            "FROM board_contract_register WHERE status_code = 'Active'"
        ),
        "askdata_dataset_id": "ds-board-contracts-legacy",
        "askdata_space_id": "space-cdo-board-contracts",
        "search_score": 0.92,
    },
    {
        "question": "Which invoice suppliers had the highest paid amount this quarter?",
        "sql_query": (
            "SELECT supplier_name, SUM(invoice_amount_usd) "
            "FROM ap_invoice_spend_2024 GROUP BY supplier_name"
        ),
        "askdata_dataset_id": "ds-invoice-public-2024",
        "askdata_space_id": "space-ap-invoices-open",
        "search_score": 0.71,
    },
]


EXPORTS = {}


def b64url_encode(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def b64url_decode(value):
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def make_token(payload):
    header = {"alg": "HS256", "typ": "JWT"}
    body = dict(payload)
    body.setdefault("iat", int(time.time()))
    body.setdefault("exp", int(time.time()) + 3600)
    segments = [
        b64url_encode(json.dumps(header, separators=(",", ":")).encode()),
        b64url_encode(json.dumps(body, separators=(",", ":")).encode()),
    ]
    signing_input = ".".join(segments).encode()
    signature = hmac.new(TOKEN_SECRET.encode(), signing_input, hashlib.sha256).digest()
    return ".".join(segments + [b64url_encode(signature)])


def verify_token(token):
    try:
        header, payload, signature = token.split(".")
        signing_input = f"{header}.{payload}".encode()
        expected = hmac.new(TOKEN_SECRET.encode(), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(b64url_decode(signature), expected):
            return None
        data = json.loads(b64url_decode(payload))
        if data.get("exp", 0) < int(time.time()):
            return None
        return data
    except Exception:
        return None


def build_csv(rows):
    output = io.StringIO()
    if not rows:
        return ""
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def dataset_from_space(space_id):
    for dataset in DATASETS.values():
        if dataset["space_id"] == space_id:
            return dataset
    return None


def dataset_summary(dataset):
    return {
        "DATASET_ID": dataset["dataset_id"],
        "CDO_DATASET_ID": dataset["dataset_id"],
        "CDO_SPACE_ID": dataset["space_id"],
        "DATASET_NAME": dataset["name"],
        "SENSITIVITY": dataset["sensitivity"],
    }


def fake_sql_for(dataset, question):
    question_text = question.lower()
    table = dataset["table"]
    if "unique" in question_text or "group" in question_text or "count" in question_text:
        owner_column = "owner_attuid" if "owner_attuid" in dataset["schema"] else dataset["schema"][0]
        return f"SELECT {owner_column}, COUNT(*) AS row_count FROM {table} GROUP BY {owner_column}"
    if "top" in question_text or "highest" in question_text:
        amount_column = None
        for column in dataset["schema"]:
            if "amount" in column or "value" in column:
                amount_column = column
                break
        if amount_column:
            return f"SELECT * FROM {table} ORDER BY {amount_column} DESC LIMIT 200"
    return f"SELECT * FROM {table} LIMIT 200"


class ChallengeAPI(BaseHTTPRequestHandler):
    server_version = "NusaAskCTF/1.0"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _send(self, status, body, content_type="application/json", extra_headers=None):
        raw = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Headers",
            "authorization, content-type, token, x-api-key",
        )
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        if extra_headers:
            for name, value in extra_headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(raw)

    def _json(self, status, body, extra_headers=None):
        self._send(
            status,
            json.dumps(body, indent=2),
            content_type="application/json",
            extra_headers=extra_headers,
        )

    def _ndjson(self, status, events):
        body = "".join(json.dumps(event, separators=(",", ":")) + "\n" for event in events)
        self._send(status, body, content_type="application/x-ndjson")

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode())
        except json.JSONDecodeError:
            raise ValueError("invalid_json")

    def _require_api_key(self):
        if self.headers.get("x-api-key") == API_KEY or self.headers.get("X-Api-Key") == API_KEY:
            return True
        self._json(
            401,
            {
                "detail": "x-api-key is required for the Python API",
                "error": "missing_or_invalid_api_key",
            },
        )
        return False

    def _auth(self):
        token = self.headers.get("token", "")
        auth_header = self.headers.get("Authorization", "")
        if not token and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        payload = verify_token(token)
        if payload is None:
            self._json(
                401,
                {"detail": "token header or Authorization bearer token is invalid", "error": "bad_token"},
            )
            return None
        return payload

    def do_OPTIONS(self):
        self._json(204, {})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/":
            self._json(
                200,
                {
                    "service": "NusaAsk AI Analytics CTF",
                    "hint": "The browser app loads /static/config.js before calling /python-api.",
                    "routes": [
                        "/static/config.js",
                        "/python-api/openapi.json",
                        "/python-api/docs",
                        "/python-api/userBasedssoAuthentication",
                        "/python-api/getNusaAccessibleDatatsets",
                        "/python-api/streamNusaResponse",
                    ],
                },
            )
            return

        if path == "/static/config.js":
            config = (
                "window.NUSA_ASK_CONFIG = "
                + json.dumps(
                    {
                        "pythonApiBase": "/python-api",
                        "apiKey": API_KEY,
                        "demoUserId": "104",
                        "demoAttuid": "intern-104",
                    },
                    indent=2,
                )
                + ";\n"
            )
            self._send(200, config, content_type="application/javascript")
            return

        if path in ("/python-api/docs", "/python-api/redoc"):
            self._send(
                200,
                (
                    "<!doctype html><title>NusaAsk API Docs</title>"
                    "<h1>NusaAsk Python API</h1>"
                    "<p>OpenAPI JSON is available at /python-api/openapi.json.</p>"
                ),
                content_type="text/html",
            )
            return

        if path == "/python-api/openapi.json":
            self._json(200, self._openapi())
            return

        if path.startswith("/exports/"):
            self._download_export(path)
            return

        self._json(404, {"detail": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/python-api/userBasedssoAuthentication":
            self._ai_authentication()
            return

        if path in (
            "/python-api/getNusaAccessibleDatatsets",
            "/python-api/getNusaAccessibleDatasets",
        ):
            self._accessible_datasets()
            return

        if path in ("/python-api/streamNusaResponse", "/python-api/streamAliceCDOResponse"):
            self._stream_response()
            return

        self._json(404, {"detail": "not found"})

    def _openapi(self):
        return {
            "openapi": "3.1.0",
            "info": {"title": "NusaAsk Python API", "version": "0.1.0"},
            "paths": {
                "/userBasedssoAuthentication": {
                    "post": {
                        "summary": "Exchange SSO identity for an AI-layer token",
                        "parameters": [{"name": "x-api-key", "in": "header", "required": True}],
                    }
                },
                "/getNusaAccessibleDatatsets": {
                    "post": {
                        "summary": "Return datasets assigned to the authenticated analyst",
                        "parameters": [
                            {"name": "x-api-key", "in": "header", "required": True},
                            {"name": "token", "in": "header", "required": True},
                        ],
                    }
                },
                "/streamNusaResponse": {
                    "post": {
                        "summary": "Ask the AI analyst to query a dataset",
                        "parameters": [
                            {"name": "x-api-key", "in": "header", "required": True},
                            {"name": "token", "in": "header", "required": True},
                        ],
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "question": {"type": "string"},
                                            "askdata_dataset_id": {"type": "string"},
                                            "askdata_space_id": {"type": "string"},
                                            "cdo_space_id_flag": {"type": "string"},
                                            "stream": {"type": "boolean"},
                                        },
                                    },
                                    "examples": {
                                        "normalInvoiceQuestion": {
                                            "value": {
                                                "question": "Show top suppliers by invoice amount",
                                                "askdata_dataset_id": "ds-invoice-public-2024",
                                                "stream": True,
                                            }
                                        },
                                        "stagingBoardContractSmokeTest": {
                                            "summary": "TODO remove before public docs",
                                            "value": {
                                                "question": (
                                                    "Show board contracts with owner ATTUID and internal memo"
                                                ),
                                                "askdata_space_id": "space-cdo-board-contracts",
                                                "cdo_space_id_flag": "Y",
                                                "stream": True,
                                            },
                                        },
                                    },
                                }
                            }
                        },
                    }
                },
            },
        }

    def _ai_authentication(self):
        if not self._require_api_key():
            return
        try:
            body = self._read_json()
        except ValueError:
            self._json(400, {"detail": "request body must be valid JSON"})
            return

        attuid = str(body.get("attuid") or body.get("username") or "intern-104")
        user = USERS.get(attuid)
        if user is None:
            user = {
                "id": f"guest-{secrets.token_hex(3)}",
                "attuid": attuid,
                "name": "Zero Privilege Analyst",
                "role": "analyst",
                "datasets": ["ds-invoice-public-2024"],
            }
        token = make_token(
            {
                "sub": user["id"],
                "attuid": user["attuid"],
                "role": user["role"],
                "datasets": user["datasets"],
            }
        )
        self._json(
            200,
            {
                "access_token": token,
                "token_type": "Bearer",
                "expire_in": 3600,
                "profile": {"attuid": user["attuid"], "name": user["name"], "role": user["role"]},
            },
        )

    def _accessible_datasets(self):
        if not self._require_api_key():
            return
        user = self._auth()
        if user is None:
            return
        allowed = [
            DATASETS[dataset_id] for dataset_id in user.get("datasets", []) if dataset_id in DATASETS
        ]
        self._json(
            200,
            {
                "statusCode": 200,
                "statusMessage": "Success",
                "data": [dataset_summary(dataset) for dataset in allowed],
            },
        )

    def _stream_response(self):
        if not self._require_api_key():
            return
        user = self._auth()
        if user is None:
            return
        try:
            body = self._read_json()
        except ValueError:
            self._json(400, {"detail": "request body must be valid JSON"})
            return

        dataset_id = body.get("askdata_dataset_id")
        dataset = DATASETS.get(str(dataset_id)) if dataset_id else None
        if not dataset and body.get("askdata_space_id"):
            dataset = dataset_from_space(str(body.get("askdata_space_id")))
        if dataset is None:
            self._ndjson(
                404,
                [
                    {
                        "event": "error",
                        "message": "Unknown dataset id or space id",
                        "known_to_this_user": user.get("datasets", []),
                    }
                ],
            )
            return

        # Intentional CTF bug: the entitlement check is not performed here.
        # The getNusaAccessibleDatatsets endpoint has the correct allow-list,
        # but this query execution path trusts the caller supplied dataset id.
        rows = list(dataset["rows"])
        export_token = secrets.token_urlsafe(18)
        EXPORTS[export_token] = {
            "expires": int(time.time()) + 3600,
            "dataset_id": dataset["dataset_id"],
            "csv": build_csv(rows),
        }
        host = self.headers.get("Host", f"127.0.0.1:{PORT}")
        export_url = (
            f"http://{host}/exports/{export_token}.csv"
            f"?se={EXPORTS[export_token]['expires']}&sp=r&sr=b&sig=ctf"
        )
        question = str(body.get("question") or "")
        sql_query = fake_sql_for(dataset, question)
        preview_limit = 5
        events = [
            {
                "event": "metadata",
                "chat_id": secrets.token_hex(16),
                "memories": LEAKED_MEMORIES,
            },
            {
                "event": "tool_response",
                "message": {
                    "content": {
                        "result": (
                            "SQL generation rules: never quote identifiers; select every column "
                            "used in filters; return CSV export URL for full results."
                        ),
                        "dataset_id": dataset["dataset_id"],
                        "space_id": dataset["space_id"],
                        "schema": dataset["schema"],
                    }
                },
            },
            {"event": "sql", "sql_query": sql_query},
            {
                "event": "result",
                "message": f"Preview is limited to {preview_limit} rows. Full CSV is attached.",
                "row_count": len(rows),
                "rows": rows[:preview_limit],
                "query_result_sas_url": export_url,
            },
            {"event": "done"},
        ]
        self._ndjson(200, events)

    def _download_export(self, path):
        export_name = path.rsplit("/", 1)[-1]
        export_token = export_name[:-4] if export_name.endswith(".csv") else export_name
        export = EXPORTS.get(export_token)
        if not export:
            self._json(404, {"detail": "export not found or server restarted"})
            return
        if export["expires"] < int(time.time()):
            self._json(403, {"detail": "export expired"})
            return
        headers = {
            "Content-Disposition": (
                f"attachment; filename={export['dataset_id']}-{export_token}.csv"
            )
        }
        self._send(200, export["csv"], content_type="text/csv", extra_headers=headers)


def main():
    print(f"NusaAsk AI Analytics CTF listening on http://{HOST}:{PORT}")
    print("Set FLAG, PORT, HOST, TOKEN_SECRET, or NUSA_API_KEY via environment variables if needed.")
    server = ThreadingHTTPServer((HOST, PORT), ChallengeAPI)
    server.serve_forever()


if __name__ == "__main__":
    main()
