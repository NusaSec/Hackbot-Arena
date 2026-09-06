# TenantDB — solver

**Flag:** `FLAG{nusasec-e46ea47dbb6ae795d060038d8a35ef0a}` · **Port:** 8100 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The team-access page filters its listing by role, and it does so by concatenating the `role` parameter directly into the SQL statement that reads the caller's tenant table. Nothing is bound; a single quote closes the string literal and everything after it becomes query grammar. The application also renders database errors in the HTML response, which is what makes the flaw comfortably explorable — the database talks back.

The architecture multiplies the damage. Tenants share one database server as table-per-tenant namespaces, and the SQL account the application uses can read all of them — the same shared-service-account mistake from the source finding, where a bug-bounty tenant's injection reached twenty-plus production tenants. With the injection in hand, the schema itself is enumerable (`sqlite_master` lists every tenant's tables), and a `UNION SELECT` appends foreign rows to the rendered listing. The flag lives in another tenant's secrets table, three requests from registration. (The source finding extracted data through MSSQL conversion errors; this build's SQLite has no comparable error channel, so the reference uses UNION — the root cause and the cross-tenant reach are unchanged.)

## The right fix

Parameterize every query — the role filter is data, not code, and binding it makes injection structurally impossible rather than filtered-out. Suppress database errors in responses; verbose errors are a free oracle. And isolate tenants where a mistake in one cannot read another: separate database accounts scoped to a single tenant's namespace (or separate databases), so even a successful injection in one tenant dies at the permission boundary. Least-privilege DB accounts are the control that turns "injected query" into "query I was already allowed to run."
