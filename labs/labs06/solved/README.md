# AdTechAdmin — solved

**Flag:** `FLAG{nusasec-340482e9e82766672d665e10b3ce240b}` · **Port:** 8086 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The service authenticates with JWTs and then never uses them for authorization. The `require_auth` decorator decodes the token and verifies the signature — and stops there. The `role` claim inside the token (admin, analyst, user) is read into `request.current_user` and then ignored by every route: user creation, user modification, user deletion, group deletion, and the admin config endpoint all run for any holder of a valid token. Authentication answers "who are you"; nothing in the code ever asks "what are you allowed to do". A signed-but-low-privilege analyst token is therefore indistinguishable from an admin token at the enforcement layer, which is broken function-level authorization.

The second problem is the key material: the HS256 signing secret is a hardcoded string in the source. Symmetric signing means possession of the secret equals the ability to mint tokens, so anyone who can read the source (or this lab) can forge an admin token without ever logging in. The lab's flag is attached to the write endpoints, so any single authenticated write — even by the analyst — proves the bypass.

## The right fix

Authorization must be enforced per function, not assumed from authentication: every admin-capable route needs an explicit role check against a server-side source of truth (the database, not the token claim alone). The JWT secret must be a high-entropy value loaded from the environment, never committed. And write endpoints should not return secrets at all — the flag-in-response pattern exists here to make the bypass observable, but in production a successful create/update should return the created resource, nothing more.
