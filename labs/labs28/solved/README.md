# C2MZeroAuth - solved

**Flag:** `FLAG{nusasec-3a7d7ae920ef0256899fcb47c6c23aa8}` · **Port:** 8108 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The platform treats the browser admin console as the security boundary, but the
backend API exposes production operations without authentication. Swagger shows
that monitoring publish, database smoke-test, security-question lookup, user
creation, and token issuance endpoints are all callable anonymously.

The critical issue is broken function-level authorization in account creation.
`/api/CreateUser` trusts the caller-supplied `roleIDs` value, so an anonymous
request can create a user with `requestmanageradmin`. `/api/GetAccessToken`
then signs a normal JWT for that newly created account. The admin route is
properly gated by role, but it trusts the valid token minted by the vulnerable
zero-auth chain.

## The right fix

All account creation and token issuance flows must be behind explicit
authorization checks. Role assignment should be server-side and policy-driven,
not accepted from public request bodies. Test and smoke-test endpoints should
not be reachable in production, and security-question data should never be
returned to unauthenticated callers.
