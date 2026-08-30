# JWTea — solved

**Flag:** `FLAG{nusasec-21d41178f15cdf55f97189a36196f7bf}` · **Port:** 8083 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

This is JWT algorithm confusion, the CVE-2015-9235 family. The backend uses a hand-written JWT verifier, and three of its choices line up badly.

First, the verifier takes the `alg` field from the token header — data the attacker fully controls — and dispatches to whatever verification path that field names. The algorithm is a protocol decision that must be pinned server-side; letting the token choose it means letting the attacker choose which math protects you.

Second, alongside RS256 the verifier keeps an HS256 "legacy mobile client" path, and its HMAC secret is the RSA **public** key PEM. This is the core confusion: RS256 is secure because signing requires the private key, but HS256 is symmetric — knowing the secret is enough to sign. Using the public key as the HMAC secret converts a key that is *meant* to be public into the signing capability itself.

Third, the public key is published at `/.well-known/jwks.json` and the `/docs/api` page openly says HS256 is accepted. So the "secret" is handed to every caller. Anyone can rebuild the exact PEM from the JWK, sign `{"alg":"HS256"}` tokens with HMAC-SHA256 over that PEM, and the verifier accepts them as if they were legitimate.

One more decision finishes the escalation: on verification, the token's `role` claim overrides the role stored in the database. A forged `role: "admin"` claim in the HS256 token is therefore enough to reach `GET /api/admin/treasury/secrets`, where `treasury_signature_key` is the flag. The subtlety that makes the exploit reliable is byte-exactness — the HMAC must be computed over the *same PEM bytes* the server reads from disk (same SPKI format, line wrapping, and trailing newline), not merely an equivalent key.

## The right fix

Never write JWT verification by hand: use a maintained library with an explicit, server-side `algorithms` whitelist (here: `["RS256"]` only). Never reuse asymmetric public keys as symmetric secrets — a "legacy compatibility" branch that shares key material between algorithms is exactly how this bug class is born. Delete the HS256 path. And treat the database, not the token, as the source of truth for authorization roles; a token should identify the user, not promote them.
