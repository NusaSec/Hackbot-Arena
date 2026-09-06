# CallbackListener — solver

**Flag:** `FLAG{nusasec-10c9ea849913be681f0308eea2a57f9f}` · **Port:** 8087 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

Webhook registration asks the operator for a URL, and the server then makes an outbound POST to it to verify ownership — the standard challenge-response pattern. What makes it vulnerable is that the URL is used with **no validation at all**: no scheme restriction, no host allowlist, no block on private or internal address ranges. The application chooses where it connects entirely based on attacker input, which is the definition of SSRF. From the server's position, internal services, cloud metadata endpoints, and localhost-only interfaces are all suddenly reachable through the webhook feature.

The challenge design makes the flaw self-evident: the response even has to contain a random token, and the service helpfully provides its own echo endpoint (`POST /api/echo`) that returns any request body verbatim. Pointing the webhook at itself satisfies the check in one request — proving that "verification" here verifies nothing except that *some* server echoed a string. The flag is returned in the registration response.

## The right fix

Outbound callbacks need an allowlist drawn from configuration (scheme `https`, explicit permitted hosts), resolution-time blocking of private/link-local/loopback ranges (including DNS-rebinding-safe re-resolution), and ideally an egress proxy so the callback path is logged and bounded. Ownership verification should also bind the challenge to the webhook's purpose — a shared secret confirmed out-of-band — rather than trusting "a server somewhere echoed this token".
