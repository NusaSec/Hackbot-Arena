# TalentHubProfileLeak - solved

**Flag:** `FLAG{nusasec-ca997f859a82746a9d8d36a80c316bca}` · **Port:** 8109 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The public profile API treats a serializer choice as if it were harmless. The
route accepts either a public handle or an internal user ID, requires no token,
and returns creator-dashboard data to anonymous callers. The leaked response
contains private order ledgers, purchaser names, payment methods, moderation
metadata, internal pricing, feature flags, and direct `nakedMediaUrl` links.

The fanclub preview endpoint creates the second half of the chain. It is meant
to show public preview posts, but it also embeds paid messages and subscriber
user IDs. One of those IDs belongs to an internal retest account. Querying that
ID through the public profile endpoint exposes an order with the flag media ID,
and the CDN route returns the raw media body without checking authorization.

## The right fix

Public profile responses should be built from an explicit allow-listed DTO, not
from dashboard or ORM objects. Fanclub previews must exclude paid content,
subscriber identifiers, payments, and moderation queues. Raw media objects need
authorization checks or short-lived signed URLs scoped to the requesting user,
with signatures validated server-side instead of trusting cache-style query
parameters.
