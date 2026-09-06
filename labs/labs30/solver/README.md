# LabelKeySQLi — solver

**Flag:** `FLAG{nusasec-ead0b0caaec732b48f1b648b2e32778c}` · **Port:** 8110 · **Reference exploit:** `./run.sh`

The bug is in how the GraphQL resolvers turn `labels[].key` into SQL. The label value is passed as a bound parameter, but the key is copied straight into the text of the PostgreSQL expression. That means the key becomes code, while the value stays data.

Once a single quote in the key closes the string literal, the attacker can change the boolean expression around the label comparison. That gives three practical channels:

- a syntax-error oracle that shows the generated SQL fragment;
- a boolean oracle that flips `totalCount` and confirms control over the predicate;
- a time or error-based extraction path that can read arbitrary PostgreSQL expressions.

The same helper is reused by `assetSearchSuggestions`, so the bug is reachable through two different GraphQL fields. The final extraction uses a cast error against `tenant_secrets`, which is enough to return the flag text verbatim.

The fix is straightforward: treat the label key exactly like the label value and bind it as a parameter, or reject anything except a strict allow-list before it reaches SQL. In this lab the problem is not PostgreSQL itself; it is string concatenation in the resolver.
