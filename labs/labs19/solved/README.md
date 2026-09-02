# SpendGate — solved

**Flag:** `FLAG{nusasec-24b92318392cd7c0c0ecf653f52a7c36}` · **Port:** 8099 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The platform is multi-tenant, and its tenant isolation is enforced in exactly one place — a scope condition prepended to the user-supplied RQL filter in the paginated vendor search. Because the scope clause is joined to the user's text **without wrapping parentheses**, operator precedence betrays it: the combined expression parses as `(scope AND user_filter) OR user_tail`, so any condition with a top-level OR — `(id == 'zzz') || (1==1)` — evaluates true for every record in every tenant. Conditions are parsed by a minimal grammar (field/number/string comparisons joined by `&&`/`||`) and never evaluated as code, so the exploit path is the precedence bug itself — there is no code-injection shortcut. A subtler variant from the source findings still applies inside one tenant: `(year_to_date_spend > N)` enumerates vendors by financial criteria the caller should not be able to sort by.

The second bug waits one hop away. The bill-payment endpoint answers the question "what did we last pay this vendor" and returns the full payment object including `vendorBankAccountObj` — and it checks only that the caller is logged in, never that the vendor belongs to the caller's company. On its own, that missing check would be hard to exploit: foreign vendor IDs are not exposed anywhere legitimate. Combined with the scope bypass, the chain writes itself: break the listing to harvest foreign IDs, then feed one to the payment endpoint. The flag sits in the target vendor's `plaintext_routing_number` — banking data that should have been masked for everyone, let alone foreign tenants.

## The right fix

Tenant isolation must be enforced in the query layer, not composed into user-supplied expressions: resolve the tenant server-side and apply it as a separate, non-overridable filter (a bound parameter in the WHERE clause), never as text prepended to input the caller controls. Object-level endpoints must re-check ownership on every access: the payment handler needs `vendor.org == caller.org` before serializing bank objects. And financial fields like account and routing numbers belong masked or omitted except for explicitly authorized viewers — a broken mask is what turns an authorization bug into a data breach.
