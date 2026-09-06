# SsrfProxy — solver

**Flag:** `FLAG{nusasec-9035ec6f5d9696d1e1c4e183e547b276}` · **Port:** 8095 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

`POST /api/fetch` is a URL-fetching feature with zero restrictions: the user-supplied URL goes directly into `urlopen` — no scheme validation, no host allowlist, no blocking of loopback or private ranges — and the fetched body is returned to the caller. That is SSRF with both halves maximized: the attacker picks any destination *and* receives the response, turning the service into an unrestricted proxy for internal infrastructure.

The internal config endpoint shows why that matters. It holds the flag and guards itself with a loopback check — only `127.0.0.1`/`::1` may read it. But the SSRF request is issued by the server, so its source address is loopback by definition; the IP gate authorizes the very attack bypassing it. This is the general failure of network-position access control: "same host" says nothing about intent, and any feature that lets a remote user make the host talk to itself dissolves the boundary entirely. (The same class of bug reaches cloud metadata endpoints in real deployments, which is why unfiltered fetch features are treated as critical.)

## The right fix

Remove raw URL-fetching features, or constrain them hard: allowlist destinations from configuration, resolve and validate the IP at connection time (blocking loopback, link-local, private, and metadata ranges, with re-resolution protection against DNS rebinding), enforce scheme/size/timeout limits, and never reflect response bodies. Internal endpoints need real authentication and ideally network segregation — a loopback check is placement, not authorization, and the two must never be confused.
