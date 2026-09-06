# OtelCollector — solver

**Flag:** `FLAG{nusasec-5afd1419b4f1f3347ae2ad4f96caf8c1}` · **Port:** 8091 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The telemetry collector authenticates writes with a single static bearer token — and the token is published on its own landing page, base64-encoded inside an HTML comment. Encoding is not encryption and a comment is not a vault: viewing the page source and decoding one string yields a valid collector credential. Static, shared, and never-rotated tokens are already weak (no revocation, no attribution), and leaking them into the deliverable HTML removes even the pretense of secrecy. Anyone can now write telemetry as a legitimate collector.

The second half is what the token unlocks. Ingested telemetry is stored verbatim and readable by anyone via unauthenticated GETs on the same endpoints. That inverts the usual protection: the *write* path is (nominally) guarded while the *read* path is open, so any secret that enters a payload becomes public knowledge. The flag is returned by a single authenticated `POST /v1/traces` with any body — the guard itself was the puzzle.

## The right fix

Collector ingestion should use per-collector credentials with rotation and least privilege (a metrics shipper has no business writing traces), issued via configuration — never embedded in served pages, in any encoding. Stored telemetry must be treated as untrusted input: schema-validated, redacted where it can carry secrets, and access-controlled on read just like on write. Base64 in an HTML comment is the canonical example of security by obscurity; the fix is to stop shipping secrets to clients at all.
