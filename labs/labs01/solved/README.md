# CacheKey — solved

**Flag:** `FLAG{nusasec-dab948102b49bbc577c9624ac90ccf79}` · **Port:** 8081 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The lab combines two independent, innocent-looking decisions into a web cache deception (Omer Gil, Black Hat USA 2017).

The backend defines its profile route as a greedy regex: `/api/account` and everything below it (`/api/account/anything`, including `.css`) return the requesting session's private profile JSON, with the user's `api_key` inside. That is decision A, and it is a problem because the shape of a URL no longer tells you what kind of response it produces — a path that *looks* like a static asset returns private, per-user data.

Nginx, in front of the backend, caches any URL that ends in a static extension. Its cache key is only `scheme + method + URI` — it deliberately contains no cookie and no host — and it overrides the backend's `Cache-Control: private, no-store` while stripping `Set-Cookie` from the stored response. That is decision B, and it is a problem for three reasons: responses that carry an identity are filed under a key that ignores identity, so every user who requests the same URL shares one cached copy; the backend's explicit "do not cache" instruction is thrown away; and the cookie that would re-personalize the response is deleted.

Neither decision is exploitable alone. Together, anyone who can make a logged-in victim request `/api/account/foo.css` stores that victim's private profile in a public cache slot. The lab ships an admin bot that browses submitted URLs while logged in as the admin — and the admin's `api_key` *is* the flag, so the cached copy under a attacker-chosen `.css` path leaks it to the next anonymous visitor.

## The right fix

The backend must match its private routes strictly (`/api/account` only, 404 below it). The cache must never store responses to authenticated requests: respect `Cache-Control: private`, keep `Set-Cookie` out of stored entries only when the response is actually public, and include the auth cookie in the cache key for any path that can produce dynamic output. A private response that accidentally gets cached is a credential leak, not a performance win.
