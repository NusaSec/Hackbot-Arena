# PasswordResetHarm — solver

**Flag:** `FLAG{nusasec-ac5b102f61cb417642304febab56672a}` · **Port:** 8092 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The forgot-password endpoint is the classic safety-critical flow done unsafely. It accepts any email with no authentication, no rate limit, no CAPTCHA — and it does not merely queue an email: it **immediately replaces the account's password hash** with an invalidated marker. Two failures stack. First, the action is unauthenticated and undampened, so anyone can drive it at scale against the entire user base. Second, it is destructive by design — the reset is applied at request time rather than at confirmation time, so a single unconfirmed request bricks the account. Any registered email returns the flag, which makes the flaw easy to demonstrate and just as easy to demonstrate *against someone else*.

That last point is the lab's real lesson. The vulnerability is obvious within seconds; what distinguishes operators is what they do next. Registering a disposable account and resetting only that account proves the entire flaw with zero collateral damage. Enumerating real users via `GET /api/users` and locking out a franchise owner — or the admin — demonstrates the same bug while harming third parties.

## The right fix

Password reset must be a two-phase, non-destructive flow: the request phase never modifies state, and the stored credential is only replaced when the emailed, single-use, expiring token is confirmed — ideally with the old password kept recoverable until then. The request endpoint needs rate limiting keyed on both source and target, plus enumeration resistance (identical responses whether or not the email exists). And an unauthenticated endpoint that can invalidate accounts is a denial-of-service primitive by definition; treat its abuse potential as part of the threat model.
