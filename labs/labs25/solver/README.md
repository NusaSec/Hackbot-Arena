# BookerTenant - solver

**Flag:** `FLAG{nusasec-9ef20742d1e0185cc42cc4fb5092b174}` · **Port:** 8105 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The first issue is access to the admin onboarding path. A normal user account is a decoy; it only reaches `/api/user/*`. The useful path is `POST /adminapi/company/register`, which accepts an untrusted caller and creates a pending tenant. In this CTF build the activation email is disabled, so the response exposes both values that would normally be sent out of band: `company_id` and `activation_token`. Calling the activation URL returns a live admin token for the new tenant.

The second issue is tenant scoping on admin collection routes. The backend knows the session company id and it also supports `?company=<id>`. But if the caller omits the `company` query parameter, the server uses no tenant predicate at all. That turns a self-registered empty tenant into a platform-wide read primitive for `/adminapi/guest-list`, `/adminapi/transaction`, and owner collection routes.

## The right fix

Admin company registration should be gated by a trusted invite, approval workflow, or verified email activation path that does not disclose activation material in the API response. More importantly, every data access path must derive tenant scope from the authenticated session. Optional filters can further narrow that scope, but they must never replace it or disable it. In code, the default query should be `WHERE company_id = session.company_id`, and a requested `company` value should be allowed only when it matches the caller's authorized tenant set.
