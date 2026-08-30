// ============================================================
// Tahuna — JWT module
//
// Custom JWT implementation supporting RS256 (production default)
// and HS256 (legacy mobile clients pre-v1.4). Library implements
// sign + verify with alg taken from the token header.
// ============================================================
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_DIR = process.env.JWT_KEY_DIR || '/keys';
const KEY_ID = 'tahuna-2026-01';

function b64urlEncode(buf) {
  if (!(buf instanceof Buffer)) buf = Buffer.from(buf);
  return buf.toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

// ============================================================
// Key management — generate RSA keypair on first boot, persist to disk
// ============================================================
function ensureKeys() {
  if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true });
  const privPath = path.join(KEY_DIR, 'jwt-private.pem');
  const pubPath = path.join(KEY_DIR, 'jwt-public.pem');

  if (!fs.existsSync(privPath) || !fs.existsSync(pubPath)) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
    fs.writeFileSync(pubPath, publicKey,  { mode: 0o644 });
    console.log('[jwt] generated new RSA keypair at', KEY_DIR);
  }

  return {
    privateKey: fs.readFileSync(privPath, 'utf8'),
    publicKey:  fs.readFileSync(pubPath, 'utf8')
  };
}

const KEYS = ensureKeys();

// ============================================================
// JWK helpers (for /.well-known/jwks.json)
// ============================================================
function publicKeyToJwk(pem) {
  const keyObject = crypto.createPublicKey(pem);
  const jwk = keyObject.export({ format: 'jwk' });
  return {
    kty: jwk.kty,
    n:   jwk.n,
    e:   jwk.e,
    alg: 'RS256',
    use: 'sig',
    kid: KEY_ID
  };
}

// ============================================================
// Sign (server only — issues RS256 tokens)
// ============================================================
function sign(payload, expiresInSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iat: now,
    exp: now + (expiresInSeconds || 60 * 60 * 8), // 8 hour default
    iss: 'tahuna-auth',
    aud: 'tahuna-app',
    ...payload
  };
  const header = { alg: 'RS256', typ: 'JWT', kid: KEY_ID };

  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(claims));
  const data = h + '.' + p;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const sig = signer.sign(KEYS.privateKey);

  return data + '.' + b64urlEncode(sig);
}

// ============================================================
// Verify — accepts alg from token header (the bug)
// ============================================================
function verify(token) {
  if (!token || typeof token !== 'string') throw new Error('token required');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');

  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
  } catch (e) {
    throw new Error('invalid token encoding');
  }

  const sig = b64urlDecode(parts[2]);
  const data = parts[0] + '.' + parts[1];

  // Algorithm dispatch based on the alg claim in the header.
  // Supports RS256 (production) and HS256 (legacy mobile clients pre-v1.4).
  const alg = header.alg;
  if (alg === 'RS256') {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(data);
    verifier.end();
    if (!verifier.verify(KEYS.publicKey, sig)) {
      throw new Error('signature verification failed');
    }
  } else if (alg === 'HS256') {
    // Legacy verification path. Uses the same key material as RS256
    // for backward-compat with older mobile clients that don't ship
    // the RSA verifier. Key is read from the same source as RS256
    // because we only maintain one key pair per environment.
    const expected = crypto.createHmac('sha256', KEYS.publicKey).update(data).digest();
    if (!crypto.timingSafeEqual(expected, sig)) {
      throw new Error('signature verification failed');
    }
  } else {
    throw new Error('unsupported alg: ' + alg);
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('token expired');
  if (payload.iss !== 'tahuna-auth') throw new Error('invalid issuer');
  if (payload.aud !== 'tahuna-app')  throw new Error('invalid audience');

  return { header, payload };
}

// ============================================================
// Express middleware
// ============================================================
function bearerAuth(db) {
  return function (req, res, next) {
    const header = req.header('Authorization') || '';
    const m = /^Bearer\s+(.+)$/.exec(header);
    if (!m) return res.status(401).json({ error: 'Bearer token required' });

    let v;
    try {
      v = verify(m[1]);
    } catch (e) {
      return res.status(401).json({ error: 'invalid token: ' + e.message });
    }

    const userId = v.payload.sub;
    if (!userId) return res.status(401).json({ error: 'token missing sub claim' });

    const user = db.getUserById(parseInt(userId, 10));
    if (!user) return res.status(401).json({ error: 'user not found for token' });

    // Allow role override via token claim — useful for service tokens
    // and impersonation in support workflows.
    req.user = { ...user, role: v.payload.role || user.role };
    req.tokenClaims = v.payload;
    next();
  };
}

module.exports = {
  sign,
  verify,
  bearerAuth,
  getPublicKeyPem: () => KEYS.publicKey,
  getJwk:          () => publicKeyToJwk(KEYS.publicKey),
  KEY_ID
};
