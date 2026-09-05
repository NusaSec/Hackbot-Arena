# LabelKeySQLi

- **Lab:** `labs30`
- **Category:** `web`
- **Difficulty:** `hard`
- **Port:** [8110](http://localhost:8110)
- **Flag format:** `FLAG{nusasec-<32 lowercase hex>}`

The GraphQL API for the asset portal takes a label filter on `Query.assets` and on `Query.assetSearchSuggestions`. One part of that filter is handled safely, the other is not. Your job is to find the bug, use it against your own account boundary, and recover the flag.
