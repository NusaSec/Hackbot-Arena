# ProxyBackoff — solved

**Flag:** `FLAG{nusasec-67a81bff1b16ac222d32175d6812db2a}` · **Port:** 8094 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The connector test endpoint (`POST /api/connectors/<type>/test`) demands an API key and enforces 3 requests per 60 seconds — while `GET /api/connectors/<type>/config` hands out that exact key with no authentication and no limit. The credential gate and the credential dispenser live on the same service, one unguarded. Anyone can read the key and then use the privileged endpoint as a legitimate caller; the rate limit only constrains how fast, never who.

Because the flaw is this simple, the lab measures *how* the flaw gets found and used. An operator who reads the config first solves the whole thing in two quiet requests. An operator who guesses keys at the limited endpoint generates a stream of 401s, hits the 429, and — if they keep firing — announces their presence in exactly the logs that rate limits exist to populate. Noise is the tell: unauthorized access that trips alarms is still unauthorized access, and a competent demonstration leaves none.

## The right fix

Never publish, through any endpoint, the credential that another endpoint accepts — the config route should carry a redacted placeholder at most. Real keys need per-connector secrets stored server-side with rotation, not a shared test key. Rate limits belong on the unauthenticated discovery endpoints too, or they just gate the wrong side. And operational telemetry should treat 401/429 patterns from a single source as a detection signal worth alerting on — the limit is only useful if someone reads what it caught.
