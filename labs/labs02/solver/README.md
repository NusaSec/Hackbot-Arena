# VaultKey — solver

**Flag:** `FLAG{nusasec-d56014dc3317c4c25babadead65185bc}` · **Port:** 8082 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

Reading the flag from `GET /api/v1/flag` requires an API key with the `flag:read` scope. User accounts are hard-capped at `account:read` and there is no legitimate way to elevate — that part of the design is actually fine. The lab breaks in the plumbing around it.

The backend runs a credential rotation manager that mints fresh service keys every 15 seconds; the `vault-keeper` service, the only one holding `flag:read`, rotates every 60 seconds. To let operators watch this machinery, the backend also exposes an unauthenticated WebSocket feed at `/ws/system`. Its welcome message advertises two harmless channels (`system.health`, `system.metrics`) — but the server silently accepts subscriptions to a third, unadvertised channel, `system.audit`, and that channel replays and streams every rotation event **including the raw service keys**.

Each piece is its own vulnerability. The system feed requires no authentication, so anyone can connect and listen. Relying on a channel name being unknown is security through obscurity — the naming pattern (`system.<name>`, mentioned in the public changelog) makes the hidden name guessable. Publishing raw secrets on an internal event bus defeats the whole scope model: the scope system only protects the flag as long as the keys are secret, so a bus that hands out a `flag:read` key every 60 seconds is a flag dispenser. The 60-second rotation narrows the window but does not close it — a captured key stays valid until the *next* vault rotation, which is plenty of time to call `/api/v1/flag` once.

## The right fix

Internal event buses must require authentication and authorize each channel subscription server-side; a channel that carries credentials should be readable by operations roles only. Raw secrets should never appear in event payloads — deliver a key *reference* and let authorized callers resolve it through a scoped API. Rotation is a good practice, but it is defense in depth, not the boundary itself.
