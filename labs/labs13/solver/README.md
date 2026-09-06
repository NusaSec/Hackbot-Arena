# ProjectBoard — solver

**Flag:** `FLAG{nusasec-0b9302754a9cab635495284e8a844012}` · **Port:** 8093 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The service issues JWTs carrying a `role` claim (admin, viewer) and then builds an entire API on the assumption that the claim is being enforced. It isn't. `require_auth` verifies the signature and decodes the payload — that is the whole check. No route asks whether the caller's role permits the action: the viewer account, issued the lowest-privilege token the system supports, can create, modify, and delete projects and list all users. The bug is invisible in every individual route because it lives in what the middleware *doesn't* do; nothing looks wrong until you notice that authorization never happens anywhere.

The hard-coded HS256 secret compounds it. With a symmetric algorithm, the signing secret is the trust root, and here it is a literal string in the source. Anyone who obtains it mints admin tokens offline, no credentials required — the viewer login is a convenience, not a requirement. The flag rides on every write response, so the first unauthorized POST proves both the missing role check and the over-privileged token in one step.

## The right fix

Enforce authorization per action: a decorator is not a policy, and `require_auth` must be paired with role requirements on every sensitive route — or better, capability checks derived from server-side data, so a token claim can never silently become the whole decision. Secrets belong in configuration, generated with high entropy per deployment. And returning the flag from every write is a lab device; in production, mutation responses should carry the resource state and nothing else.
