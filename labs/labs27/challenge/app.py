import json
import os
import re
import secrets
import time
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


PORT = int(os.environ.get("PORT", "5000"))
HOST = os.environ.get("HOST", "0.0.0.0")
FLAG = os.environ.get("FLAG", "FLAG{nusasec-9448e7072a60c2888e656b9b1165a4a8}")


DEFAULT_WORKFLOWS = [
    {
        "name": "Editorial Approval",
        "version": "1",
        "active": True,
        "content": """<?xml version="1.0"?>
<workflow-definition>
  <name>Editorial Approval</name>
  <description>Default review flow for newsroom content.</description>
  <state>
    <name>review</name>
    <actions>
      <action>
        <name>assign-editor</name>
        <script-language>groovy</script-language>
        <script><![CDATA[
          workflowContext.put("queue", "editorial-review")
          return "assigned"
        ]]></script>
        <execution-type>onEntry</execution-type>
      </action>
    </actions>
  </state>
</workflow-definition>""",
    },
    {
        "name": "Infra Smoke Test",
        "version": "1",
        "active": False,
        "content": """<?xml version="1.0"?>
<workflow-definition>
  <name>Infra Smoke Test</name>
  <description>Disabled after launch. Kept for debugging workflow nodes.</description>
  <state>
    <name>probe</name>
    <actions>
      <action>
        <name>command-probe</name>
        <script-language>groovy</script-language>
        <script><![CDATA[
          def p = ["id"].execute()
          p.waitFor()
          return p.text
        ]]></script>
        <execution-type>onEntry</execution-type>
      </action>
    </actions>
  </state>
</workflow-definition>""",
    },
]


WORKFLOWS = {}
SUBMISSIONS = []
NEXT_CONTENT_ID = 4000


def seed_workflows():
    for workflow in DEFAULT_WORKFLOWS:
        WORKFLOWS[workflow["name"]] = dict(workflow)


def json_bytes(body):
    return json.dumps(body, indent=2).encode()


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def parse_graphql_string(query, key):
    block = re.search(rf"\b{re.escape(key)}\s*:\s*\"\"\"(.*?)\"\"\"", query, re.S)
    if block:
        return block.group(1)

    normal = re.search(rf'\b{re.escape(key)}\s*:\s*"((?:\\.|[^"\\])*)"', query, re.S)
    if not normal:
        return None
    try:
        return json.loads(f'"{normal.group(1)}"')
    except json.JSONDecodeError:
        return normal.group(1)


def parse_graphql_bool(query, key, default=False):
    match = re.search(rf"\b{re.escape(key)}\s*:\s*(true|false)", query, re.I)
    if not match:
        return default
    return match.group(1).lower() == "true"


def to_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).lower() in ("1", "true", "yes", "on")


def get_object_variable(variables, *names):
    for name in names:
        value = variables.get(name)
        if isinstance(value, dict):
            return value
    return {}


def variable_or_literal(variables, query, key, default=None):
    if key in variables:
        return variables[key]
    for value in variables.values():
        if isinstance(value, dict) and key in value:
            return value[key]
    parsed = parse_graphql_string(query, key)
    return default if parsed is None else parsed


def workflow_public(workflow):
    return {
        "name": workflow["name"],
        "active": workflow["active"],
        "version": workflow["version"],
        "content": workflow["content"],
        "dateCreated": "2026-08-17T09:42:13Z",
    }


def workflow_definitions():
    items = [workflow_public(workflow) for workflow in WORKFLOWS.values()]
    return {"items": items, "totalCount": len(items), "page": 1, "pageSize": 20}


def schema_response():
    return {
        "queryType": {"name": "Query"},
        "mutationType": {"name": "Mutation"},
        "types": [
            graphql_type("Query"),
            graphql_type("Mutation"),
            graphql_type("WorkflowDefinition"),
            graphql_type("WorkflowDefinitionPage"),
            graphql_type("ContentSubmission"),
            graphql_type("WorkflowDefinitionInput"),
            graphql_type("ContentSubmissionInput"),
        ],
    }


def graphql_type(name):
    fields = {
        "Query": [
            field("workflowDefinitions", "WorkflowDefinitionPage", ["page", "pageSize"]),
            field("structuredContents", "[ContentSubmission]", ["page", "pageSize"]),
        ],
        "Mutation": [
            field(
                "createWorkflowDefinitionSave",
                "WorkflowDefinition",
                ["workflowDefinition"],
            ),
            field(
                "createWorkflowDefinitionUpdateActive",
                "WorkflowDefinition",
                ["name", "version", "active"],
            ),
            field(
                "createWorkflowDefinitionDeploy",
                "WorkflowDefinition",
                ["name", "version"],
            ),
            field(
                "deleteWorkflowDefinitionUndeploy",
                "WorkflowDefinition",
                ["name", "version"],
            ),
            field("submitContentForReview", "ContentSubmission", ["content"]),
            field("createContentSubmission", "ContentSubmission", ["content"]),
        ],
        "WorkflowDefinition": [
            field("name", "String", []),
            field("active", "Boolean", []),
            field("version", "String", []),
            field("content", "String", []),
            field("dateCreated", "DateTime", []),
        ],
        "WorkflowDefinitionPage": [
            field("items", "[WorkflowDefinition]", []),
            field("totalCount", "Int", []),
            field("page", "Int", []),
            field("pageSize", "Int", []),
        ],
        "ContentSubmission": [
            field("id", "Long", []),
            field("title", "String", []),
            field("status", "String", []),
            field("workflowName", "String", []),
            field("workflowOutput", "String", []),
            field("reviewLog", "[String]", []),
        ],
        "WorkflowDefinitionInput": [
            field("name", "String", []),
            field("content", "String", []),
            field("active", "Boolean", []),
        ],
        "ContentSubmissionInput": [
            field("title", "String", []),
            field("body", "String", []),
            field("workflowName", "String", []),
        ],
    }
    kind = "INPUT_OBJECT" if name.endswith("Input") else "OBJECT"
    return {"kind": kind, "name": name, "fields": fields.get(name, []), "inputFields": fields.get(name, [])}


def field(name, type_name, args):
    return {
        "name": name,
        "args": [{"name": arg, "type": {"kind": "SCALAR", "name": "String"}} for arg in args],
        "type": {"kind": "OBJECT", "name": type_name, "ofType": None},
    }


def type_lookup(query):
    name = parse_graphql_string(query, "name") or "Query"
    return graphql_type(name)


def validate_workflow_xml(content):
    try:
        ET.fromstring(content)
    except ET.ParseError as exc:
        return str(exc)
    return None


def parse_quoted_args(text):
    return [match.group(2) for match in re.finditer(r"""(['"])(.*?)\1""", text, re.S)]


def normalize_command(args):
    if len(args) >= 3 and args[0] in ("sh", "bash", "/bin/sh", "/bin/bash") and args[1] in ("-c", "-lc"):
        return args[2]
    return " ".join(args)


def extract_command(script):
    for pattern in (
        r"portal\.exec\(\s*(['\"])(.*?)\1\s*\)",
        r"(['\"])(.*?)\1\s*\.execute\(\s*\)",
    ):
        match = re.search(pattern, script, re.S)
        if match:
            return match.group(2).strip()

    for pattern in (
        r"\[(?P<args>(?:\s*['\"][^'\"]+['\"]\s*,?)+)\]\s*\.execute\s*\(",
        r"(?:new\s+)?ProcessBuilder\s*\((?P<args>.*?)\)\s*\.start\s*\(",
    ):
        match = re.search(pattern, script, re.S)
        if match:
            args = parse_quoted_args(match.group("args"))
            if args:
                return normalize_command(args).strip()

    return None


def run_virtual_command(command):
    command = command.strip()
    if command in ("id", "/usr/bin/id"):
        return "uid=1001(portal) gid=1001(portal) groups=1001(portal)\n"
    if command in ("whoami", "/usr/bin/whoami"):
        return "portal\n"
    if command in ("pwd", "/bin/pwd"):
        return "/opt/portal\n"
    if command in ("ls /", "/bin/ls /"):
        return "bin\netc\nopt\nflag.txt\n"
    if command in ("ls /opt/portal", "/bin/ls /opt/portal"):
        return "app\nlogs\nflag.txt\n"
    if re.search(r"\bcat\s+(/[^\s;&|]*flag[^\s;&|]*)", command):
        return FLAG + "\n"
    return f"/bin/sh: {command}: command not found\n"


def execute_workflow(workflow):
    try:
        root = ET.fromstring(workflow["content"])
    except ET.ParseError as exc:
        return "", [f"workflow XML parse failed: {exc}"]

    output = []
    review_log = [f"loaded workflow {workflow['name']} v{workflow['version']}"]
    for element in root.iter():
        if local_name(element.tag) != "script":
            continue
        script = element.text or ""
        command = extract_command(script)
        if not command:
            review_log.append("script block did not contain an executable command")
            continue
        review_log.append(f"executed groovy command: {command}")
        output.append(run_virtual_command(command))

    if not output:
        output.append("workflow completed\n")
    return "".join(output), review_log


class ChallengeAPI(BaseHTTPRequestHandler):
    server_version = "PortalFlowCTF/1.0"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _send(self, status, body, content_type="application/json", extra_headers=None):
        raw = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        if extra_headers:
            for name, value in extra_headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(raw)

    def _json(self, status, body):
        self._send(status, json_bytes(body), content_type="application/json")

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode())
        except json.JSONDecodeError:
            raise ValueError("invalid_json")

    def do_OPTIONS(self):
        self._json(204, {})

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/":
            self._send(200, self._landing_page(), "text/html; charset=utf-8")
            return
        if path == "/o/graphql/v1":
            self._send(200, self._graphql_page(), "text/html; charset=utf-8")
            return
        if path == "/health":
            self._json(200, {"status": "ok", "service": "PortalFlow"})
            return
        self._json(404, {"errors": [{"message": "not found"}]})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path != "/o/graphql/v1":
            self._json(404, {"errors": [{"message": "not found"}]})
            return

        try:
            body = self._read_json()
        except ValueError:
            self._json(400, {"errors": [{"message": "request body must be valid JSON"}]})
            return
        self._graphql(body)

    def _graphql(self, body):
        query = str(body.get("query") or "")
        variables = body.get("variables") if isinstance(body.get("variables"), dict) else {}
        if not query.strip():
            self._json(400, {"errors": [{"message": "GraphQL query is required"}]})
            return

        # Intentional CTF bug: this endpoint exposes sensitive workflow reads and
        # mutations without requiring a token, cookie, or session.
        if "__schema" in query:
            self._json(200, {"data": {"__schema": schema_response()}})
            return
        if "__type" in query:
            self._json(200, {"data": {"__type": type_lookup(query)}})
            return
        if "workflowDefinitions" in query and "mutation" not in query:
            self._json(200, {"data": {"workflowDefinitions": workflow_definitions()}})
            return
        if "structuredContents" in query and "mutation" not in query:
            self._json(200, {"data": {"structuredContents": SUBMISSIONS}})
            return
        if "createWorkflowDefinitionSave" in query:
            self._save_workflow(query, variables)
            return
        if "createWorkflowDefinitionUpdateActive" in query:
            self._update_workflow_active(query, variables)
            return
        if "createWorkflowDefinitionDeploy" in query:
            self._deploy_workflow(query, variables)
            return
        if "deleteWorkflowDefinitionUndeploy" in query:
            self._delete_workflow(query, variables)
            return
        if "submitContentForReview" in query or "createContentSubmission" in query:
            self._submit_content(query, variables)
            return

        self._json(
            200,
            {
                "errors": [
                    {
                        "message": "Cannot query field. Try GraphQL introspection on Query and Mutation.",
                    }
                ]
            },
        )

    def _save_workflow(self, query, variables):
        payload = get_object_variable(variables, "workflowDefinition", "input")
        name = str(payload.get("name") or variable_or_literal(variables, query, "name", "")).strip()
        content = str(payload.get("content") or variable_or_literal(variables, query, "content", "")).strip()
        active = to_bool(payload.get("active"), parse_graphql_bool(query, "active", False))

        if not name or not content:
            self._json(
                200,
                {"errors": [{"message": "workflowDefinition.name and content are required"}]},
            )
            return
        xml_error = validate_workflow_xml(content)
        if xml_error:
            self._json(200, {"errors": [{"message": f"invalid workflow XML: {xml_error}"}]})
            return

        old = WORKFLOWS.get(name)
        version = str(int(old["version"]) + 1) if old and old["version"].isdigit() else "1"
        workflow = {"name": name, "version": version, "active": active, "content": content}
        WORKFLOWS[name] = workflow
        self._json(200, {"data": {"createWorkflowDefinitionSave": workflow_public(workflow)}})

    def _update_workflow_active(self, query, variables):
        name = str(variable_or_literal(variables, query, "name", "")).strip()
        active = to_bool(variable_or_literal(variables, query, "active", None), parse_graphql_bool(query, "active", True))
        workflow = WORKFLOWS.get(name)
        if not workflow:
            self._json(200, {"errors": [{"message": f"workflow definition not found: {name}"}]})
            return
        workflow["active"] = active
        self._json(200, {"data": {"createWorkflowDefinitionUpdateActive": workflow_public(workflow)}})

    def _deploy_workflow(self, query, variables):
        name = str(variable_or_literal(variables, query, "name", "")).strip()
        workflow = WORKFLOWS.get(name)
        if not workflow:
            self._json(200, {"errors": [{"message": f"workflow definition not found: {name}"}]})
            return
        workflow["active"] = True
        self._json(200, {"data": {"createWorkflowDefinitionDeploy": workflow_public(workflow)}})

    def _delete_workflow(self, query, variables):
        name = str(variable_or_literal(variables, query, "name", "")).strip()
        workflow = WORKFLOWS.get(name)
        if not workflow:
            self._json(200, {"errors": [{"message": f"workflow definition not found: {name}"}]})
            return
        if workflow["active"]:
            self._json(
                200,
                {
                    "errors": [
                        {
                            "message": "WorkflowException: Cannot delete active workflow definition",
                        }
                    ]
                },
            )
            return
        del WORKFLOWS[name]
        self._json(200, {"data": {"deleteWorkflowDefinitionUndeploy": workflow_public(workflow)}})

    def _submit_content(self, query, variables):
        global NEXT_CONTENT_ID
        payload = get_object_variable(variables, "content", "input", "structuredContent")
        title = str(payload.get("title") or variable_or_literal(variables, query, "title", "Untitled"))
        body = str(payload.get("body") or variable_or_literal(variables, query, "body", ""))
        workflow_name = str(
            payload.get("workflowName") or variable_or_literal(variables, query, "workflowName", "")
        ).strip()

        workflow = WORKFLOWS.get(workflow_name) if workflow_name else None
        if workflow is None:
            workflow = next((item for item in WORKFLOWS.values() if item["active"]), None)
        if workflow is None or not workflow["active"]:
            submission = {
                "id": NEXT_CONTENT_ID,
                "title": title,
                "body": body,
                "status": "DRAFT",
                "workflowName": workflow_name or None,
                "workflowOutput": "",
                "reviewLog": ["no active workflow matched this submission"],
            }
        else:
            output, review_log = execute_workflow(workflow)
            submission = {
                "id": NEXT_CONTENT_ID,
                "title": title,
                "body": body,
                "status": "REVIEWED",
                "workflowName": workflow["name"],
                "workflowOutput": output,
                "reviewLog": review_log,
            }
        NEXT_CONTENT_ID += 1
        SUBMISSIONS.append(submission)
        response_key = "submitContentForReview" if "submitContentForReview" in query else "createContentSubmission"
        self._json(200, {"data": {response_key: submission}})

    def _landing_page(self):
        return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PortalFlow</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f6f7fb; color: #1d2738; }
    header { padding: 24px clamp(18px, 6vw, 70px); border-bottom: 1px solid #d9e0ea; background: #fff; }
    main { max-width: 940px; margin: 0 auto; padding: 42px 20px; display: grid; gap: 24px; }
    h1 { font-size: clamp(34px, 5vw, 58px); line-height: 1.04; margin: 0; letter-spacing: 0; }
    p { color: #5f6c7d; font-size: 18px; line-height: 1.6; max-width: 720px; }
    .panel { border: 1px solid #d9e0ea; border-radius: 8px; background: #fff; padding: 20px; }
    code { background: #edf1f7; padding: 3px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <header><strong>PortalFlow CMS</strong></header>
  <main>
    <h1>Editorial workflow and content review</h1>
    <p>The admin console is behind SSO. Service metadata is still available for integrations.</p>
    <div class="panel">
      <p>Integration endpoint: <code>/o/graphql/v1</code></p>
    </div>
  </main>
</body>
</html>
"""

    def _graphql_page(self):
        return """<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>PortalFlow GraphQL</title></head>
<body>
  <h1>PortalFlow GraphQL</h1>
  <p>POST JSON bodies with a <code>query</code> field to this endpoint.</p>
  <pre>{"query":"{ __schema { queryType { name } mutationType { name } } }"}</pre>
</body>
</html>
"""


def main():
    seed_workflows()
    print(f"PortalFlow GraphQL CTF listening on http://{HOST}:{PORT}")
    print("Set FLAG, PORT, or HOST via environment variables if needed.")
    server = ThreadingHTTPServer((HOST, PORT), ChallengeAPI)
    server.serve_forever()


if __name__ == "__main__":
    main()
