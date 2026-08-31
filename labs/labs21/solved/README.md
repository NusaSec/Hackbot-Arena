# ExportFlow — solved

**Flag:** `FLAG{nusasec-94de926836d61cb1cb25cbce7da4768d}` · **Port:** 8101 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

Two endpoints each leak half of what an attacker needs, and neither notices the other. The paginated transaction search matches a vendor-name query across **every company** that uses the vendor and returns the matching transaction IDs — identifiers only, no rows. Somewhere in its history someone decided IDs were safe to expose: they are not, because the bulk export accepts **any** ID in `includedObjects` without checking company or permission scope, and the generated CSV carries full rows including receipt memos.

Individually the bugs look small. The search discloses nothing readable; the export needs a valid ID, and an attacker's own company's IDs are mostly harmless. Chained, they are a cross-company receipt dispenser: search a shared vendor ("Lyft Business"), harvest the foreign IDs it hands you, export them, and read another company's financial memos — the flag sits in the foreign CFO's transaction note. The pattern is the classic export/IDOR pair from the source findings: bulk-action endpoints validate the *action* (you may export) but never the *objects* (these specific rows), and ID-listing endpoints leak identifiers under the assumption that IDs alone are inert.

## The right fix

Object collections in any request must be validated against the caller's scope, every element, on the server — an export is a read of N objects and deserves the same authorization as N reads. ID-listing endpoints must apply the same tenant and permission filters as the data endpoints they index; an identifier is authorization material and leaks information by existing. For shared-vendor scenarios, tenant checks cannot stop at "the vendor exists for you" — the transaction's owning company is what the caller must be authorized to read.
