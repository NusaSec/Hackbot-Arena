# GraphQLBatchOTP — solver

**Flag:** `FLAG{nusasec-3fee3def71c4c79c9ecf767f0e139041}` · **Port:** 8088 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The service defends its OTP login with a rate limit of 5 requests per 30 seconds per IP — a sensible constraint for a 6-digit code, since a million-code space needs many requests to exhaust. The flaw is what the limit counts. When `POST /graphql` receives a JSON **array**, the handler loops over every element and executes each operation inside that one HTTP request. Rate limiters almost always count requests, not operations inside them, so a batch of N mutations costs exactly one unit. The per-request limit therefore never constrains per-operation work, and the OTP space becomes brute-forceable in a manageable number of HTTP calls.

The lab rewards proving the bypass rather than weaponizing it: three `verifyLoginCode` mutations in a single batch trigger the flag, and the codes can all be wrong. The flaw is structural, not statistical — it exists whether the codes are right or not. Note the flag is delivered once per process lifetime, so a second run needs a container restart.

## The right fix

Rate limiting must be applied to the unit that matters. For batched APIs, count each operation (or reject batching outright on sensitive mutations), and key the limit on the account or identifier under attack, not only the source IP — attackers distribute across IPs precisely to defeat IP-keyed limits. OTP verification additionally deserves lockout after repeated failures and codes with short lifetimes. Batching is a legitimate GraphQL feature, but anything security-relevant executed in a loop must inherit the loop's cost accounting.
