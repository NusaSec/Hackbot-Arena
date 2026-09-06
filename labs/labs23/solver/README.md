# LiquidProfile — solver

**Flag:** `FLAG{nusasec-d2a8526db0e476ac817b22baa0bc7cbb}` · **Port:** 8103 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The profile API stores first and last names verbatim, and the change-password page greets the user by name. To build the greeting, it interpolates the stored values into a template **string** and renders that string through the Liquid engine. That order of operations is the whole vulnerability: template engine input is treated as template engine *source*. The greeting is no longer "Hello, {name}" — it is "Hello, " plus whatever code the name contains. `{{ 7 | plus: 7 }}` renders `14` and proves server-side evaluation; `{% for %}` loops run to completion on the server, which is also a denial-of-service lever (the source finding demonstrated exactly this with a multi-trillion-iteration loop).

The escalation is the render context. Page templates are normally rendered with helpful objects in scope — here `config`, which carries the application secret. That is safe as long as only trusted template authors can write templates. The moment user input becomes template source, everyone shares that scope: `{{ config.flag }}` is not an exploit of a bug in the engine but a legitimate template reading a variable it was never supposed to be able to reach. The same class reaches `{{ user }}`, request objects, and in worse deployments file-reading filters and SSTI-to-RCE chains.

## The right fix

Never render user-controlled data through a template engine as source: pass it in as a **variable** (`Template("Hello, <b>{{ first }}</b>").render(first=user_input)`), so the engine treats it as inert text, and enable autoescaping to close the XSS sibling of this bug. When a context must expose internal objects, keep secrets out of it — the flag has no business being one template expression away from any input box. Length and charset validation on profile fields is useful hygiene but is not the fix; the structural rule is that data and template source are different channels and must never be concatenated.
