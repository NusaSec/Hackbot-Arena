# NusaAskScope - solved

**Flag:** `FLAG{nusasec-768d277c78f5238025e71529ebc123ac}` · **Port:** 8106 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The API has an entitlement endpoint that gives the correct answer: the demo intern is allowed to use only the public invoice and supplier scorecard datasets. The natural-language execution endpoint does not enforce that same allow-list. It accepts a caller supplied `askdata_dataset_id` or `askdata_space_id`, resolves it server-side, and runs the query even when the authenticated user is not entitled to that dataset.

The route also leaks a path to the restricted target. A normal allowed query returns NDJSON events containing shared memories and tool metadata. One memory includes the restricted board-contract dataset id. After that, the attacker does not need SQL injection; they only need to replay the leaked dataset id into `/python-api/streamNusaResponse`. The preview is capped, but the result event includes a CSV export URL for the full dataset, where the flag is stored in `internal_memo`.

## The right fix

Treat the model layer as a presentation layer, not an authorization boundary. The execution endpoint must derive allowed dataset ids from the authenticated session and reject any requested dataset outside that set before generating SQL or creating exports. Metadata returned to users should also be scoped: memories, examples, OpenAPI examples, and tool output should not disclose restricted dataset ids or space ids to low-privilege callers.
