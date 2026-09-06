# GraphLeak — solver

**Flag:** `FLAG{nusasec-7daddd6709c575ba8b8f213607256570}` · **Port:** 8085 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The lab chains two GraphQL mistakes that are extremely common in production deployments.

Introspection is left enabled. GraphQL's `__schema` query is a built-in feature that enumerates the entire API: every query, mutation, argument, return type, and field description. The server runs with `NODE_ENV=production` but never registers the introspection-disabling validation rule, so anyone with an ordinary account can map the whole schema without seeing a line of source. That is vulnerability A — it converts "hidden" into "discoverable". Among the enumerated queries is `_systemAudit(runtimeKey)`, whose own schema description admits it is staging diagnostics and hints that the runtime key "is published in the build manifest".

The hidden query's only protection is knowledge of that key, not authorization. The resolver performs no role check whatsoever — it compares `runtimeKey` against a hardcoded audit key and, on match, returns the flag as `internalSecret`. A shared secret used as an authorization boundary is vulnerability B: possession of the string equals privilege, so the question becomes who can read the string. Anyone can: the `systemHealth` query leaks `buildManifestPath`, and that manifest endpoint sits behind nothing more than the same ordinary session every registered user already has, and it hands out `audit_key` in its JSON. This maps to OWASP API3:2023, broken object property level authorization — the operation exists in the schema, its guard is data instead of policy, and the data is exposed one hop away.

## The right fix

Disable introspection in production with a validation rule (`NoSchemaIntrospectionCustomRule`), and mask field-suggestion errors that leak names anyway. Gate sensitive resolvers with real authorization — a server-side role check, not a shared runtime key. Secrets like the audit key must not be published by any user-reachable endpoint; if an operations surface is needed, put it behind an operations role on a separate, non-public schema.
