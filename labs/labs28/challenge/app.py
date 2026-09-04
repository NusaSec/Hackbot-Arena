import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


PORT = int(os.environ.get("PORT", "5000"))
HOST = os.environ.get("HOST", "0.0.0.0")
JWT_SECRET = os.environ.get("JWT_SECRET", "c2m-local-development-secret")
FLAG = os.environ.get("FLAG", "FLAG{nusasec-3a7d7ae920ef0256899fcb47c6c23aa8}")

USER_RECORD_TOTAL = 19247
BROKER_TOPIC = "production_FeedMonitoringAPM"


USERS = {
    "admin": {
        "UserID": "10001",
        "UserName": "admin",
        "EmailAddress": "admin@c2m.example.test",
        "Password": "disabled",
        "ActiveStatus": False,
        "CompanyID": "100",
        "GroupID": 1,
        "Roles": ["requestmanageradmin"],
        "ApiKey": "adm-disabled",
    },
    "ops.viewer": {
        "UserID": "10042",
        "UserName": "ops.viewer",
        "EmailAddress": "ops.viewer@example.test",
        "Password": "ViewerPass!2026",
        "ActiveStatus": True,
        "CompanyID": "100",
        "GroupID": 3,
        "Roles": ["deviceviewer"],
        "ApiKey": "view-3a1ef8",
    },
}

EVENT_BUS = []
NEXT_USER_ID = 23560


def json_bytes(body):
    return json.dumps(body, indent=2).encode()


def b64url_encode(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def b64url_decode(value):
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def make_jwt(user):
    header = {"alg": "HS256", "typ": "JWT"}
    user_claim = {
        "UserId": user["UserID"],
        "UserName": user["UserName"],
        "ApiKey": user["ApiKey"],
        "CompanyID": user["CompanyID"],
        "Roles": user["Roles"],
    }
    payload = {
        "iss": "C2M-IoT",
        "aud": "c2m-api",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "User": json.dumps(user_claim, separators=(",", ":")),
    }
    segments = [
        b64url_encode(json.dumps(header, separators=(",", ":")).encode()),
        b64url_encode(json.dumps(payload, separators=(",", ":")).encode()),
    ]
    signing_input = ".".join(segments).encode()
    signature = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
    return ".".join(segments + [b64url_encode(signature)])


def verify_jwt(token):
    try:
        header, payload, signature = token.split(".")
        signing_input = f"{header}.{payload}".encode()
        expected = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(b64url_decode(signature), expected):
            return None
        claims = json.loads(b64url_decode(payload))
        if claims.get("exp", 0) < int(time.time()):
            return None
        return claims
    except Exception:
        return None


def user_from_claims(claims):
    if not claims:
        return None
    raw_user = claims.get("User")
    if isinstance(raw_user, str):
        try:
            return json.loads(raw_user)
        except json.JSONDecodeError:
            return None
    if isinstance(raw_user, dict):
        return raw_user
    return None


def normalize_roles(value):
    if isinstance(value, list):
        roles = [str(item).strip() for item in value if str(item).strip()]
    else:
        text = str(value or "deviceviewer")
        for char in ";|":
            text = text.replace(char, ",")
        roles = [item.strip() for item in text.replace(" ", ",").split(",") if item.strip()]
    return roles or ["deviceviewer"]


def fake_ecb_ciphertext(email):
    block = hashlib.md5(("sq:" + email.lower()).encode()).digest()
    return base64.b64encode(block).decode()


def find_user(username):
    return USERS.get(str(username or "").strip())


def swagger_spec():
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "C2M IoT Management API",
            "version": "1.0.7",
            "description": "Synthetic CTF API. Internal swagger mirror reports 544 operations.",
        },
        "x-documented-endpoint-count": 544,
        "servers": [{"url": "/"}],
        "components": {
            "securitySchemes": {
                "bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
            }
        },
        "security": [{"bearerAuth": []}],
        "paths": {
            "/api/v1/home/Publishdata": {
                "post": {
                    "summary": "Publish monitoring data into the IoT message bus",
                    "security": [],
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "examples": {
                                    "monitoring": {
                                        "value": {
                                            "topic": BROKER_TOPIC,
                                            "message": "researcher_test",
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "Data Receieved"}},
                }
            },
            "/api/v1/home/TestDBConnection": {
                "get": {
                    "summary": "Legacy production database smoke test",
                    "security": [],
                    "responses": {"200": {"description": "Database row count"}},
                }
            },
            "/api/GetSQDetail": {
                "get": {
                    "summary": "Return encrypted security question details for an email",
                    "security": [],
                    "parameters": [
                        {
                            "name": "emailId",
                            "in": "query",
                            "required": True,
                            "schema": {"type": "string"},
                            "example": "ops.viewer@example.test",
                        }
                    ],
                    "responses": {"200": {"description": "Security question detail"}},
                }
            },
            "/api/CreateUser": {
                "post": {
                    "summary": "Create a user account",
                    "security": [],
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "examples": {
                                    "adminUser": {
                                        "value": {
                                            "firstName": "Bug",
                                            "lastName": "Test",
                                            "userName": "researcher01",
                                            "emailAddress": "researcher01@example.test",
                                            "password": "Test@Pwn2026",
                                            "roleIDs": "requestmanageradmin",
                                            "groupID": 1,
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "Created user"}},
                }
            },
            "/api/GetAccessToken": {
                "post": {
                    "summary": "Exchange username and password for a signed JWT",
                    "security": [],
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "example": {
                                    "userName": "researcher01",
                                    "password": "Test@Pwn2026",
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "Access token"}},
                }
            },
            "/api/admin/fleet/breakglass": {
                "get": {
                    "summary": "Export the emergency device administration bundle",
                    "security": [{"bearerAuth": []}],
                    "responses": {"200": {"description": "Admin-only bundle"}},
                }
            },
        },
    }


class ChallengeAPI(BaseHTTPRequestHandler):
    server_version = "C2MZeroAuthCTF/1.0"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _send(self, status, body, content_type="application/json", extra_headers=None):
        raw = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        if extra_headers:
            for name, value in extra_headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(raw)

    def _json(self, status, body, extra_headers=None):
        self._send(status, json_bytes(body), content_type="application/json", extra_headers=extra_headers)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length == 0:
            return b""
        return self.rfile.read(length)

    def _read_json(self):
        raw = self._read_body()
        if not raw:
            return {}
        try:
            return json.loads(raw.decode())
        except json.JSONDecodeError:
            raise ValueError("invalid_json")

    def _method_not_allowed(self, allowed):
        self._json(405, {"error": "method_not_allowed"}, {"Allow": allowed})

    def do_OPTIONS(self):
        self._json(204, {})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/":
            self._send(200, self._landing_page(), "text/html; charset=utf-8")
            return
        if path == "/api/status":
            self._json(200, {"status": "ok", "service": "C2M IoT API"})
            return
        if path == "/swagger/v1/swagger.json":
            self._json(200, swagger_spec())
            return
        if path == "/api/v1/home/TestDBConnection":
            self._test_db_connection()
            return
        if path == "/api/GetSQDetail":
            params = parse_qs(parsed.query)
            self._security_question_detail(params.get("emailId", [""])[0])
            return
        if path == "/api/admin/fleet/breakglass":
            self._admin_breakglass()
            return
        if path in ("/api/v1/home/Publishdata", "/api/CreateUser", "/api/GetAccessToken"):
            self._method_not_allowed("POST, OPTIONS")
            return

        self._json(404, {"error": "not_found"})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"

        if path == "/api/v1/home/Publishdata":
            self._publish_data()
            return
        if path == "/api/CreateUser":
            self._create_user()
            return
        if path == "/api/GetAccessToken":
            self._get_access_token()
            return

        self._json(404, {"error": "not_found"})

    def _test_db_connection(self):
        self._json(
            200,
            {
                "code": "200",
                "status": "SUCCESS",
                "message": str(USER_RECORD_TOTAL),
                "server": "sql-prod-c2m-01",
            },
        )

    def _security_question_detail(self, email):
        email = str(email or "").strip().lower()
        if not email:
            self._json(400, {"error": "emailId is required"})
            return
        user = next((item for item in USERS.values() if item["EmailAddress"].lower() == email), None)
        if not user:
            self._json(200, [])
            return

        encrypted_block = fake_ecb_ciphertext(email)
        self._json(
            200,
            [
                {
                    "Answer1": encrypted_block,
                    "Answer2": encrypted_block,
                    "Pin": encrypted_block,
                    "SecurityQuestion1": "",
                    "SecurityQuestion2": "",
                }
            ],
        )

    def _publish_data(self):
        raw = self._read_body()
        parsed = None
        if raw:
            try:
                parsed = json.loads(raw.decode())
            except json.JSONDecodeError:
                parsed = raw.decode(errors="replace")
        topic = BROKER_TOPIC
        if isinstance(parsed, dict) and parsed.get("topic"):
            topic = str(parsed["topic"])
        EVENT_BUS.append(
            {
                "topic": topic,
                "payload": parsed,
                "acceptedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )
        self._send(200, "Data Receieved", "text/plain; charset=utf-8")

    def _create_user(self):
        global NEXT_USER_ID
        try:
            body = self._read_json()
        except ValueError:
            self._json(400, {"error": "request body must be valid JSON"})
            return

        missing = [
            key
            for key in ("firstName", "lastName", "userName", "emailAddress", "password")
            if not body.get(key)
        ]
        if missing:
            self._json(400, {"error": "missing_params", "required_params": missing})
            return

        username = str(body["userName"]).strip()
        if username in USERS:
            self._json(409, {"error": "user_already_exists"})
            return

        roles = normalize_roles(body.get("roleIDs"))
        group_id = int(body.get("groupID") or 3)
        user = {
            "UserID": str(NEXT_USER_ID),
            "UserName": username,
            "EmailAddress": str(body["emailAddress"]).strip(),
            "Password": str(body["password"]),
            "ActiveStatus": True,
            "CompanyID": str(body.get("companyID") or "100"),
            "GroupID": group_id,
            "Roles": roles,
            "ApiKey": hashlib.sha256(f"{username}:{time.time()}".encode()).hexdigest()[:20],
        }
        NEXT_USER_ID += 1
        USERS[username] = user

        # Intentional CTF bug: anonymous callers can choose privileged roles,
        # and the response echoes sensitive account material.
        self._json(
            200,
            {
                "code": "200",
                "status": "SUCCESS",
                "message": "User created",
                "data": {
                    "UserID": user["UserID"],
                    "UserName": user["UserName"],
                    "EmailAddress": user["EmailAddress"],
                    "ActiveStatus": user["ActiveStatus"],
                    "CompanyID": user["CompanyID"],
                    "GroupID": user["GroupID"],
                    "RoleIDs": ",".join(user["Roles"]),
                    "Password": user["Password"],
                    "ApiKey": user["ApiKey"],
                },
            },
        )

    def _get_access_token(self):
        try:
            body = self._read_json()
        except ValueError:
            self._json(400, {"error": "request body must be valid JSON"})
            return

        username = str(body.get("userName") or body.get("username") or "").strip()
        password = str(body.get("password") or "")
        user = find_user(username)
        if user is None:
            self._json(
                401,
                {
                    "code": "401",
                    "status": "FAILED",
                    "message": "Invalid user name or password",
                },
            )
            return
        if not user["ActiveStatus"]:
            self._json(
                403,
                {
                    "code": "403",
                    "status": "FAILED",
                    "message": "Your account is not activated",
                },
            )
            return
        if not hmac.compare_digest(user["Password"], password):
            self._json(
                401,
                {
                    "code": "401",
                    "status": "FAILED",
                    "message": "Invalid user name or password",
                },
            )
            return

        token = make_jwt(user)
        self._json(
            200,
            {
                "code": "200",
                "status": "SUCCESS",
                "message": "you have successfully logged in",
                "data": {
                    "Tokens": {
                        "AccessToken": token,
                        "RefreshToken": secrets.token_urlsafe(24),
                        "ExpiresIn": 3600,
                    },
                    "User": {
                        "UserID": user["UserID"],
                        "UserName": user["UserName"],
                        "ActiveStatus": user["ActiveStatus"],
                        "CompanyID": user["CompanyID"],
                        "Roles": user["Roles"],
                    },
                },
            },
        )

    def _admin_breakglass(self):
        auth_header = self.headers.get("Authorization", "")
        token = auth_header.split(" ", 1)[1].strip() if auth_header.startswith("Bearer ") else ""
        claims = verify_jwt(token)
        user = user_from_claims(claims)
        roles = user.get("Roles", []) if user else []
        if "requestmanageradmin" not in roles:
            self._json(403, {"error": "admin_role_required"})
            return

        self._json(
            200,
            {
                "code": "200",
                "status": "SUCCESS",
                "data": {
                    "fleet": "SEA-C2M-PROD",
                    "companyID": user["CompanyID"],
                    "messageBusTopic": BROKER_TOPIC,
                    "eventsAccepted": len(EVENT_BUS),
                    "deviceAdminBreakglass": FLAG,
                },
            },
        )

    def _landing_page(self):
        return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>C2M IoT Console</title>
  <style>
    :root { --bg: #f5f7fa; --ink: #1b2533; --muted: #657184; --line: #d8e0ea; --panel: #fff; --accent: #0f766e; --warn: #b45309; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { height: 68px; display: flex; align-items: center; justify-content: space-between; padding: 0 clamp(18px, 6vw, 76px); background: #fff; border-bottom: 1px solid var(--line); }
    .brand { font-weight: 780; font-size: 20px; }
    nav { display: flex; gap: 18px; color: var(--muted); font-size: 14px; }
    main { max-width: 1040px; margin: 0 auto; padding: 44px 20px 56px; display: grid; grid-template-columns: 1fr 360px; gap: 28px; align-items: start; }
    h1 { margin: 0 0 16px; font-size: clamp(34px, 5vw, 56px); line-height: 1.05; letter-spacing: 0; }
    p { color: var(--muted); font-size: 18px; line-height: 1.6; margin: 0 0 18px; max-width: 680px; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; display: grid; gap: 14px; }
    .row { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--line); padding-bottom: 12px; font-size: 14px; }
    .row:last-child { border-bottom: 0; padding-bottom: 0; }
    .row span { color: var(--muted); }
    code { background: #edf2f7; border-radius: 6px; padding: 3px 6px; }
    .status { color: var(--accent); font-weight: 720; }
    .warn { color: var(--warn); font-weight: 720; }
    @media (max-width: 820px) { header { height: auto; padding-top: 18px; padding-bottom: 18px; align-items: flex-start; flex-direction: column; gap: 12px; } main { grid-template-columns: 1fr; } nav { flex-wrap: wrap; } }
  </style>
</head>
<body>
  <header>
    <div class="brand">C2M IoT Console</div>
    <nav><span>Devices</span><span>Monitoring</span><span>Admin SSO</span></nav>
  </header>
  <main>
    <section>
      <h1>Device operations for regional IoT fleets.</h1>
      <p>The web console is behind SSO. Integration clients use the documented API surface for monitoring and account operations.</p>
      <p>Swagger: <code>/swagger/v1/swagger.json</code></p>
    </section>
    <aside class="panel" aria-label="service status">
      <div class="row"><strong>API</strong><span class="status">online</span></div>
      <div class="row"><strong>Fleet</strong><span>SEA-C2M-PROD</span></div>
      <div class="row"><strong>Broker</strong><span class="warn">monitoring feed</span></div>
      <div class="row"><strong>Auth</strong><span>SSO required</span></div>
    </aside>
  </main>
</body>
</html>
"""


def main():
    print(f"C2M IoT ZeroAuth CTF listening on http://{HOST}:{PORT}")
    print("Set FLAG, PORT, HOST, or JWT_SECRET via environment variables if needed.")
    server = ThreadingHTTPServer((HOST, PORT), ChallengeAPI)
    server.serve_forever()


if __name__ == "__main__":
    main()
