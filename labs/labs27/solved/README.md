# PortalFlowGraphQL - solved

**Flag:** `FLAG{nusasec-9448e7072a60c2888e656b9b1165a4a8}` · **Port:** 8107 · **Reference exploit:** `./run.sh`

## Why this is vulnerable

The sensitive boundary is the default GraphQL endpoint. It allows anonymous
clients to perform introspection, read workflow definitions, save new workflow
XML, activate workflows, and submit content that triggers workflow actions.

The existing `Infra Smoke Test` workflow leaks the important detail: workflow
action scripts use Groovy and can call command-execution primitives. The exploit
uses the same administrative GraphQL path to save a new workflow containing a
Groovy action script, activates it, and submits content bound to that workflow.
The lab uses a virtual command runner, so no real OS command is executed, but
the workflow output returns the flag when the payload reads the simulated flag
file.

## The right fix

GraphQL introspection and workflow administration must be behind the same
authorization boundary as the admin console. Workflow definitions should not be
readable or mutable by anonymous callers, and action script execution should be
restricted, audited, and isolated. Deactivating public GraphQL introspection is
not enough if sensitive mutations remain callable by unauthenticated users.
