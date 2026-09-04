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
TOKEN_SECRET = os.environ.get("TOKEN_SECRET", "ctf-development-secret")
FLAG = os.environ.get("FLAG", "FLAG{nusasec-9ef20742d1e0185cc42cc4fb5092b174}")

REQUIRED_COMPANY_FIELDS = [
    "name",
    "email",
    "phone",
    "password",
    "repeat_password",
    "lang",
    "agree",
]

COMPANIES = {
    101: {"id": 101, "name": "North Pier Stays", "active": True},
    202: {"id": 202, "name": "Bumi Raya Villas", "active": True},
    303: {"id": 303, "name": "Aster Transit Hotel", "active": True},
}

PENDING_COMPANIES = {}
USERS = {
    "guest@example.test": {
        "id": 1,
        "email": "guest@example.test",
        "password": "guest123",
        "role": "user",
        "name": "Guest Account",
    }
}
NEXT_COMPANY_ID = 10485
NEXT_USER_ID = 2000


PUBLIC_PROPERTIES = [
    {
        "id": "PUB-1001",
        "name": "North Pier Superior Room",
        "city": "Split",
        "from_price": 82,
        "currency": "EUR",
    },
    {
        "id": "PUB-1002",
        "name": "Bumi Raya Pool Villa",
        "city": "Lombok",
        "from_price": 140,
        "currency": "USD",
    },
    {
        "id": "PUB-1003",
        "name": "Aster Transit Twin",
        "city": "Jakarta",
        "from_price": 55,
        "currency": "USD",
    },
]

GUESTS = [
    {
        "id": 363330,
        "company_id": 101,
        "first_name": "Merete",
        "last_name": "Svendsen",
        "email": None,
        "phone": None,
        "check_in_date": "2026-09-03",
        "check_in_time": "14:00",
        "check_out_date": "2026-09-10",
        "check_out_time": "10:00",
        "country_of_residence": "Norway",
        "registered": 1,
    },
    {
        "id": 363329,
        "company_id": 202,
        "first_name": "Morten",
        "last_name": "Olsen",
        "email": "morten.olsen@example.test",
        "phone": None,
        "check_in_date": "2026-09-12",
        "check_in_time": "15:00",
        "check_out_date": "2026-09-14",
        "check_out_time": "11:00",
        "country_of_residence": "Norway",
        "registered": 1,
    },
    {
        "id": 31337,
        "company_id": 303,
        "first_name": "Flag",
        "last_name": "Holder",
        "email": "security-audit@example.test",
        "phone": "+6200000000",
        "check_in_date": "2026-10-31",
        "check_in_time": "13:37",
        "check_out_date": "2026-11-01",
        "check_out_time": "09:00",
        "country_of_residence": "Indonesia",
        "registered": 1,
        "booking_reference": FLAG,
    },
    {
        "id": 363111,
        "company_id": 101,
        "first_name": "Ayu",
        "last_name": "Pranata",
        "email": None,
        "phone": "+62812000001",
        "check_in_date": "2026-08-30",
        "check_in_time": "16:00",
        "check_out_date": "2026-09-02",
        "check_out_time": "10:00",
        "country_of_residence": "Indonesia",
        "registered": 0,
    },
]

TRANSACTIONS = [
    {
        "id": 965292,
        "company_id": 101,
        "order_number": "DB_PG_6a70a6c81bd17",
        "approval_number": None,
        "credit_card_type": "MASTER",
        "credit_card_number": "7780",
        "timestamp": "2026-08-30 16:33:44",
        "amount": 1922.4,
        "currency": {"id": 2, "code": "EUR", "name": "EUR"},
        "status": {"id": "decline", "name": "decline"},
        "payment_gateway": {"id": 6, "name": "WsPay"},
    },
    {
        "id": 965293,
        "company_id": 202,
        "order_number": "DB_PG_0aa1099bc201",
        "approval_number": "A99201",
        "credit_card_type": "VISA",
        "credit_card_number": "4242",
        "timestamp": "2026-08-30 16:41:02",
        "amount": 450.0,
        "currency": {"id": 1, "code": "USD", "name": "USD"},
        "status": {"id": "approved", "name": "approved"},
        "payment_gateway": {"id": 6, "name": "WsPay"},
    },
    {
        "id": 965294,
        "company_id": 303,
        "order_number": "DB_PG_FLAG_WINDOW",
        "approval_number": "CTF1337",
        "credit_card_type": "MASTER",
        "credit_card_number": "1337",
        "timestamp": "2026-08-30 17:00:00",
        "amount": 1337.0,
        "currency": {"id": 2, "code": "EUR", "name": "EUR"},
        "status": {"id": "approved", "name": "approved"},
        "payment_gateway": {"id": 6, "name": "WsPay"},
        "reservation_note": FLAG,
    },
]

OWNERS = [
    {
        "id": 1,
        "company_id": 101,
        "name": "ibrinC",
        "last_name": "",
        "full_name": "ibrinC",
        "oib": None,
        "person_type": None,
        "self_issue": 0,
        "vat_system": None,
        "registration_number": None,
    },
    {
        "id": 2,
        "company_id": 202,
        "name": "ANTUN",
        "last_name": "VLAHUTIN",
        "full_name": "ANTUN VLAHUTIN",
        "oib": "30658682824",
        "person_type": 1,
        "self_issue": 1,
        "vat_system": 0,
        "registration_number": None,
    },
    {
        "id": 3,
        "company_id": 303,
        "name": "CTF",
        "last_name": "OWNER",
        "full_name": "CTF OWNER",
        "oib": "00000000000",
        "person_type": 1,
        "self_issue": 0,
        "vat_system": 0,
        "registration_number": FLAG,
    },
]


def b64url_encode(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def b64url_decode(value):
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def make_token(payload):
    header = {"alg": "HS256", "typ": "JWT"}
    body = dict(payload)
    body.setdefault("iat", int(time.time()))
    body.setdefault("exp", int(time.time()) + 48 * 3600)
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


def next_company_id():
    global NEXT_COMPANY_ID
    company_id = NEXT_COMPANY_ID
    NEXT_COMPANY_ID += 1
    return company_id


def next_user_id():
    global NEXT_USER_ID
    user_id = NEXT_USER_ID
    NEXT_USER_ID += 1
    return user_id


def public_item(item):
    return {key: value for key, value in item.items() if key != "company_id"}


def like(value, needle):
    if value is None:
        return False
    return str(needle).lower() in str(value).lower()


def parse_positive_int(value, default, maximum=None):
    try:
        parsed = int(value)
        if parsed < 1:
            return default
        if maximum is not None:
            return min(parsed, maximum)
        return parsed
    except (TypeError, ValueError):
        return default


class ChallengeAPI(BaseHTTPRequestHandler):
    server_version = "BookerCTF/1.0"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _json(self, status, body, extra_headers=None):
        raw = json.dumps(body, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Headers",
            "authorization, content-type, x-demo-mode, x-api-key",
        )
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        if extra_headers:
            for name, value in extra_headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(raw)

    def _send_text(self, status, body, content_type):
        raw = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode())
        except json.JSONDecodeError:
            raise ValueError("invalid_json")

    def _auth(self, expected_role=None):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            self._json(
                401,
                {
                    "data": None,
                    "error_list": [
                        {
                            "code": "missing_authorization",
                            "message": "Authorization: Bearer <token> is required",
                        }
                    ],
                },
            )
            return None
        payload = verify_token(header.split(" ", 1)[1].strip())
        if payload is None:
            self._json(
                401,
                {
                    "data": None,
                    "error_list": [
                        {"code": "invalid_token", "message": "Token is invalid or expired"}
                    ],
                },
            )
            return None
        if expected_role and payload.get("role") != expected_role:
            self._json(
                403,
                {
                    "data": None,
                    "error_list": [
                        {
                            "code": "wrong_role",
                            "message": f"{expected_role} role is required",
                        }
                    ],
                },
            )
            return None
        return payload

    def do_OPTIONS(self):
        self._json(204, {})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)

        if path == "/":
            self._send_text(200, self._landing_page(), "text/html; charset=utf-8")
            return

        if path == "/assets/app.js":
            self._send_text(
                200,
                self._client_script(),
                "application/javascript; charset=utf-8",
            )
            return

        if path == "/.well-known/booker-client.json":
            self._json(
                200,
                {
                    "app": "Booker Tools",
                    "environment": "demo",
                    "public_api": {
                        "status": "/api/status",
                        "properties": "/api/properties",
                    },
                    "user_api": {
                        "register": "/api/user/register",
                        "login": "/api/user/login",
                        "me": "/api/user/me",
                    },
                    "partner_portal": {
                        "base": "/adminapi",
                        "registration": "/company/register",
                        "activation_template": "/company/register/{company_id}/{activation_token}",
                    },
                },
            )
            return

        if path == "/api/status":
            self._json(200, {"data": {"status": "ok", "mode": "ctf"}, "error_list": []})
            return

        if path == "/api/properties":
            city = query.get("city", [None])[0]
            rows = PUBLIC_PROPERTIES
            if city:
                rows = [row for row in rows if like(row.get("city"), city)]
            self._json(200, {"data": rows, "error_list": []})
            return

        if path == "/api/user/me":
            user = self._auth()
            if user is None:
                return
            if user.get("role") != "user":
                self._json(
                    403,
                    {
                        "data": None,
                        "error_list": [
                            {
                                "code": "admin_token_on_user_api",
                                "message": "This endpoint only returns normal user profiles",
                            }
                        ],
                    },
                )
                return
            self._json(
                200,
                {
                    "data": {
                        "id": user.get("sub"),
                        "email": user.get("email"),
                        "role": user.get("role"),
                    },
                    "error_list": [],
                },
            )
            return

        if path == "/adminapi/guest-list":
            self._admin_collection(query, GUESTS, ["first_name", "last_name", "email"])
            return

        if path == "/adminapi/transaction":
            self._admin_collection(query, TRANSACTIONS, ["order_number", "approval_number"])
            return

        if path in ("/adminapi/owner/paginate-list", "/adminapi/owner/list"):
            self._admin_collection(query, OWNERS, ["name", "last_name", "full_name", "oib"])
            return

        self._json(
            404,
            {"data": None, "error_list": [{"code": "not_found", "message": "Unknown route"}]},
        )

    def _landing_page(self):
        return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Booker Tools</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --panel: #ffffff;
      --text: #172033;
      --muted: #687386;
      --line: #dfe5ee;
      --brand: #fb5d3d;
      --accent: #1677ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 22px clamp(18px, 5vw, 72px);
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.9);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 760;
      font-size: 20px;
    }
    .mark {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: var(--brand);
      color: #fff;
      display: grid;
      place-items: center;
      font-weight: 900;
    }
    nav {
      display: flex;
      gap: 18px;
      align-items: center;
      color: var(--muted);
      font-size: 14px;
    }
    nav a { color: inherit; text-decoration: none; }
    main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 56px clamp(18px, 5vw, 36px) 72px;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
      gap: 42px;
      align-items: center;
    }
    h1 {
      margin: 0 0 18px;
      font-size: clamp(38px, 6vw, 68px);
      line-height: 1.02;
      letter-spacing: 0;
    }
    .lead {
      color: var(--muted);
      font-size: 18px;
      line-height: 1.7;
      max-width: 680px;
      margin: 0 0 28px;
    }
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 28px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--text);
      text-decoration: none;
      font-weight: 650;
    }
    .button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }
    .search {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 18px;
      box-shadow: 0 14px 38px rgba(27, 39, 66, 0.08);
    }
    .search h2 {
      margin: 0 0 14px;
      font-size: 18px;
    }
    .controls {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
    }
    input, button {
      min-height: 42px;
      border-radius: 7px;
      border: 1px solid var(--line);
      font: inherit;
    }
    input { padding: 0 12px; }
    button {
      padding: 0 14px;
      background: var(--text);
      color: #fff;
      cursor: pointer;
    }
    .results {
      margin-top: 14px;
      display: grid;
      gap: 10px;
      color: var(--muted);
    }
    .property {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcff;
    }
    .property strong { color: var(--text); }
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 34px;
    }
    .metric {
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .metric strong { display: block; font-size: 22px; }
    .metric span { color: var(--muted); font-size: 13px; }
    footer {
      max-width: 1120px;
      margin: 0 auto;
      padding: 0 clamp(18px, 5vw, 36px) 28px;
      color: var(--muted);
      font-size: 13px;
    }
    code {
      background: #eef2f8;
      border-radius: 5px;
      padding: 2px 5px;
    }
    @media (max-width: 780px) {
      header { align-items: flex-start; flex-direction: column; }
      nav { flex-wrap: wrap; }
      .hero { grid-template-columns: 1fr; }
      .controls, .metrics { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand"><span class="mark">b</span> Booker Tools</div>
    <nav>
      <a href="/api/status">Status</a>
      <a href="/api/properties">Properties API</a>
      <a href="/api/user/me">Account</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <div>
        <h1>Bookings, guests, and payouts in one workspace.</h1>
        <p class="lead">Booker Tools helps small hospitality teams keep public listings, guest stays, owner records, and payment operations in sync across channels.</p>
        <div class="actions">
          <a class="button primary" href="/api/properties">Browse properties</a>
          <a class="button" href="/api/status">Check API status</a>
        </div>
        <div class="metrics">
          <div class="metric"><strong>3</strong><span>demo regions</span></div>
          <div class="metric"><strong>24/7</strong><span>booking API</span></div>
          <div class="metric"><strong>v1</strong><span>client portal</span></div>
        </div>
      </div>
      <div class="search">
        <h2>Property availability</h2>
        <div class="controls">
          <input id="city" autocomplete="off" placeholder="City, e.g. Jakarta">
          <button id="search">Search</button>
        </div>
        <div id="results" class="results">Loading public properties...</div>
      </div>
    </section>
  </main>
  <footer>
    Partner integrations use the same API gateway as the public app. Client bootstrap metadata is published for web deployments.
  </footer>
  <script src="/assets/app.js"></script>
</body>
</html>
"""

    def _client_script(self):
        return """const clientConfigUrl = "/.well-known/booker-client.json";
const results = document.querySelector("#results");
const cityInput = document.querySelector("#city");
const searchButton = document.querySelector("#search");

async function apiGet(path) {
  const response = await fetch(path, { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

async function loadProperties() {
  const city = cityInput.value.trim();
  const params = city ? `?city=${encodeURIComponent(city)}` : "";
  results.textContent = "Loading...";
  try {
    const payload = await apiGet(`/api/properties${params}`);
    results.innerHTML = payload.data.map((property) => `
      <div class="property">
        <div><strong>${property.name}</strong><br>${property.city}</div>
        <div>${property.currency} ${property.from_price}</div>
      </div>
    `).join("") || "No public properties found.";
  } catch (error) {
    results.textContent = error.message;
  }
}

// The partner SPA loads additional paths from clientConfigUrl during onboarding.
loadProperties();
searchButton.addEventListener("click", loadProperties);
cityInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadProperties();
});
"""

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/user/register":
            self._user_register()
            return

        if path == "/api/user/login":
            self._user_login()
            return

        if path == "/adminapi/company/register":
            self._company_register()
            return

        self._json(
            404,
            {"data": None, "error_list": [{"code": "not_found", "message": "Unknown route"}]},
        )

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        prefix = "/adminapi/company/register/"
        if path.startswith(prefix):
            parts = path[len(prefix) :].split("/")
            if len(parts) == 2:
                self._company_activate(parts[0], parts[1])
                return

        self._json(
            404,
            {"data": None, "error_list": [{"code": "not_found", "message": "Unknown route"}]},
        )

    def _user_register(self):
        try:
            body = self._read_json()
        except ValueError:
            self._json(
                400,
                {
                    "data": None,
                    "error_list": [
                        {"code": "invalid_json", "message": "Request body must be valid JSON"}
                    ],
                },
            )
            return

        missing = [field for field in ["email", "password"] if not body.get(field)]
        if missing:
            self._json(
                400,
                {
                    "data": None,
                    "missing_params": missing,
                    "required_params": ["email", "password"],
                    "error_list": [
                        {"field": field, "message": f"{field} is required"} for field in missing
                    ],
                },
            )
            return
        email = str(body["email"]).lower()
        if email in USERS:
            self._json(
                409,
                {
                    "data": None,
                    "error_list": [
                        {"code": "email_exists", "message": "Email is already registered"}
                    ],
                },
            )
            return
        USERS[email] = {
            "id": next_user_id(),
            "email": email,
            "password": str(body["password"]),
            "role": "user",
            "name": str(body.get("name", "User")),
        }
        self._json(
            200,
            {
                "data": {"email": email, "role": "user"},
                "error_list": [],
            },
        )

    def _user_login(self):
        try:
            body = self._read_json()
        except ValueError:
            self._json(
                400,
                {
                    "data": None,
                    "error_list": [
                        {"code": "invalid_json", "message": "Request body must be valid JSON"}
                    ],
                },
            )
            return
        user = USERS.get(str(body.get("email", "")).lower())
        if not user or user["password"] != body.get("password"):
            self._json(
                401,
                {
                    "data": None,
                    "error_list": [
                        {"code": "bad_credentials", "message": "Invalid email or password"}
                    ],
                },
            )
            return
        token = make_token({"sub": user["id"], "email": user["email"], "role": "user"})
        self._json(
            200,
            {
                "data": {"token_type": "Bearer", "access_token": token},
                "error_list": [],
            },
        )

    def _company_register(self):
        try:
            body = self._read_json()
        except ValueError:
            self._json(
                400,
                {
                    "data": None,
                    "error_list": [
                        {"code": "invalid_json", "message": "Request body must be valid JSON"}
                    ],
                },
            )
            return

        missing = [field for field in REQUIRED_COMPANY_FIELDS if body.get(field) in (None, "")]
        errors = [{"field": field, "message": f"{field} is required"} for field in missing]
        if body.get("password") and body.get("repeat_password"):
            if body["password"] != body["repeat_password"]:
                errors.append(
                    {"field": "repeat_password", "message": "repeat_password must match password"}
                )
        if "agree" not in missing and body.get("agree") not in (1, True, "1", "true", "yes"):
            errors.append({"field": "agree", "message": "agree must be accepted"})

        if errors:
            self._json(
                400,
                {
                    "data": None,
                    "missing_params": missing,
                    "required_params": REQUIRED_COMPANY_FIELDS,
                    "error_list": errors,
                },
            )
            return

        company_id = next_company_id()
        activation_token = secrets.token_hex(32)
        email = str(body["email"]).lower()
        company = {
            "id": company_id,
            "name": str(body["name"]),
            "email": email,
            "phone": str(body["phone"]),
            "lang": str(body["lang"]),
            "active": False,
        }
        PENDING_COMPANIES[company_id] = {
            "company": company,
            "activation_token": activation_token,
            "password": str(body["password"]),
        }

        self._json(
            200,
            {
                "data": {
                    "company_id": company_id,
                    "activation_token": activation_token,
                    "activation_url": (
                        f"/adminapi/company/register/{company_id}/{activation_token}"
                    ),
                    "message": "Activation email is disabled in CTF mode.",
                },
                "error_list": [],
            },
        )

    def _company_activate(self, company_id_text, activation_token):
        try:
            company_id = int(company_id_text)
        except ValueError:
            self._json(
                400,
                {
                    "data": None,
                    "error_list": [
                        {"code": "bad_company_id", "message": "company_id must be numeric"}
                    ],
                },
            )
            return

        pending = PENDING_COMPANIES.get(company_id)
        if not pending or pending["activation_token"] != activation_token:
            self._json(
                404,
                {
                    "data": None,
                    "error_list": [
                        {
                            "code": "activation_not_found",
                            "message": "Company id or activation token is invalid",
                        }
                    ],
                },
            )
            return

        company = pending["company"]
        company["active"] = True
        COMPANIES[company_id] = company
        del PENDING_COMPANIES[company_id]
        user_id = next_user_id()
        access_token = make_token(
            {
                "sub": user_id,
                "role": "admin",
                "aud": "adminapi",
                "company_id": company_id,
                "email": company["email"],
            }
        )
        refresh_token = secrets.token_hex(64)
        self._json(
            200,
            {
                "data": {
                    "token_type": "Bearer",
                    "expires_in": 172800,
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "company_id": company_id,
                },
                "error_list": [],
            },
        )

    def _admin_collection(self, query, rows, searchable_fields):
        admin = self._auth(expected_role="admin")
        if admin is None:
            return

        scoped_rows = self._apply_company_scope(rows, query, admin["company_id"])
        for field in searchable_fields:
            needle = query.get(field, [None])[0]
            if needle:
                scoped_rows = [row for row in scoped_rows if like(row.get(field), needle)]
        search = query.get("search", [None])[0]
        if search:
            scoped_rows = [
                row
                for row in scoped_rows
                if any(like(value, search) for value in row.values() if not isinstance(value, dict))
            ]

        page = parse_positive_int(query.get("page", ["1"])[0], default=1)
        limit = parse_positive_int(query.get("limit", ["20"])[0], default=20, maximum=100)
        start = (page - 1) * limit
        end = start + limit
        items = [public_item(row) for row in scoped_rows[start:end]]
        last_page = max(1, (len(scoped_rows) + limit - 1) // limit)

        self._json(
            200,
            {
                "data": {
                    "page": page,
                    "total": len(scoped_rows),
                    "last_page": last_page,
                    "items": items,
                },
                "error_list": [],
            },
        )

    def _apply_company_scope(self, rows, query, session_company_id):
        company_filter = query.get("company", [None])[0]
        if company_filter not in (None, ""):
            try:
                company_id = int(company_filter)
            except ValueError:
                return []
            return [row for row in rows if row.get("company_id") == company_id]

        # Intentional CTF bug: no explicit company query means no tenant WHERE clause.
        # A real fix would return only rows where company_id == session_company_id.
        return list(rows)


def main():
    print(f"Booker Tools CTF API listening on http://{HOST}:{PORT}")
    print("Set FLAG, PORT, HOST, or TOKEN_SECRET via environment variables if needed.")
    server = ThreadingHTTPServer((HOST, PORT), ChallengeAPI)
    server.serve_forever()


if __name__ == "__main__":
    main()
