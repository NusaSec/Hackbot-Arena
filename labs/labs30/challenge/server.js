const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { URL } = require('url');

const PORT = Number.parseInt(process.env.PORT || '5000', 10);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://labelkeysqli@postgres:5432/labelkeysqli';
const FLAG_RE = /FLAG\{nusasec-[0-9a-f]{32}\}/;

const TOKENS = new Map();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function text(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function sqlLiteral(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function sqlIdentifier(value) {
  return String(value ?? '');
}

function psql(sql) {
  const result = spawnSync(
    'psql',
    [
      '--no-psqlrc',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-d',
      DATABASE_URL,
      '-t',
      '-A',
      '-F',
      '\t',
      '-c',
      sql
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PGCONNECT_TIMEOUT: '5'
      }
    }
  );

  if (result.error) {
    throw result.error;
  }

  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function psqlScalar(sql) {
  const result = psql(sql);
  if (!result.ok) {
    throw new Error(result.stderr.trim() || 'postgres query failed');
  }
  return result.stdout.trim();
}

function psqlRows(sql) {
  const result = psql(sql);
  if (!result.ok) {
    throw new Error(result.stderr.trim() || 'postgres query failed');
  }
  const out = result.stdout.trim();
  if (!out) return [];
  return out.split('\n').map((line) => line.split('\t'));
}

function psqlError(sql) {
  const result = psql(sql);
  if (result.ok) {
    return null;
  }
  return result.stderr.trim() || 'postgres query failed';
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(`${password}|labelkeysqli-salt-v1`).digest('hex');
}

function issueToken(email) {
  const token = crypto.randomBytes(24).toString('hex');
  TOKENS.set(token, email);
  return token;
}

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function renderUi() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LabelKeySQLi</title>
  <style>
    :root { color-scheme: dark; --bg: #0d1117; --card: #161b22; --muted: #8b949e; --line: #30363d; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: linear-gradient(135deg, #0d1117, #111827 55%, #151b2f); color: #e6edf3; }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 40px 20px 64px; display: grid; gap: 20px; }
    .hero, .panel { background: rgba(22, 27, 34, 0.92); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28); }
    .hero { padding: 28px; }
    .hero h1 { margin: 0 0 10px; font-size: 38px; }
    .hero p { margin: 0; color: var(--muted); max-width: 72ch; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
    .panel { padding: 20px; }
    .panel h2 { margin: 0 0 16px; font-size: 18px; }
    label { display: block; margin: 12px 0 6px; color: var(--muted); font-size: 13px; }
    input, textarea, button { width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid var(--line); background: #0d1117; color: #e6edf3; padding: 12px 14px; font: inherit; }
    textarea { min-height: 160px; resize: vertical; }
    button { background: linear-gradient(180deg, #238636, #1f6feb); border: none; font-weight: 700; cursor: pointer; }
    button.secondary { background: #21262d; border: 1px solid var(--line); }
    pre { margin: 0; padding: 14px; min-height: 180px; overflow: auto; background: #0b1020; border-radius: 12px; border: 1px solid var(--line); white-space: pre-wrap; word-break: break-word; }
    .row { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tiny { color: var(--muted); font-size: 12px; margin-top: 10px; line-height: 1.45; }
    @media (max-width: 900px) { .grid, .row { grid-template-columns: 1fr; } .hero h1 { font-size: 30px; } }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>LabelKeySQLi</h1>
      <p>Register or log in, then use your bearer token against <code>POST /query/ui</code>. The request must stay inside your own space unless you can break the SQL used to filter labels.</p>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>Register</h2>
        <label>Email</label>
        <input id="reg-email" value="student@arena.local" autocomplete="off">
        <label>Full name</label>
        <input id="reg-name" value="Student One" autocomplete="off">
        <label>Password</label>
        <input id="reg-pass" type="password" value="student123">
        <button id="reg-btn">Create account</button>
      </div>

      <div class="panel">
        <h2>Log in</h2>
        <label>Email</label>
        <input id="log-email" value="pilot@arena.local" autocomplete="off">
        <label>Password</label>
        <input id="log-pass" type="password" value="Demo123!">
        <button id="log-btn" class="secondary">Log in</button>
      </div>
    </section>

    <section class="panel">
      <h2>GraphQL console</h2>
      <label>Bearer token</label>
      <input id="token" placeholder="paste token here">
      <div class="row">
        <button id="save-token" class="secondary">Save token</button>
        <button id="clear-token" class="secondary">Clear token</button>
      </div>
      <label>Query</label>
      <textarea id="query">query Me {
  me {
    email
    fullName
    primarySpaceMrn
    spaces { mrn displayName tenantSlug }
  }
}</textarea>
      <div class="row">
        <button id="run">Run query</button>
        <button id="sample" class="secondary">Load sample assets query</button>
      </div>
      <label>Variables</label>
      <textarea id="vars">{}</textarea>
      <label>Response</label>
      <pre id="output">{}</pre>
      <div class="tiny">The judge uses the API directly, but the UI is useful for validating login and query flow by hand.</div>
    </section>
  </div>

  <script>
    const storageKey = 'labelkeysqli_token';
    const tokenInput = document.getElementById('token');
    tokenInput.value = localStorage.getItem(storageKey) || '';

    async function postJson(url, body, headers = {}) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
      });
      return res.json();
    }

    document.getElementById('save-token').onclick = () => {
      localStorage.setItem(storageKey, tokenInput.value.trim());
      document.getElementById('output').textContent = JSON.stringify({ saved: true }, null, 2);
    };

    document.getElementById('clear-token').onclick = () => {
      localStorage.removeItem(storageKey);
      tokenInput.value = '';
      document.getElementById('output').textContent = JSON.stringify({ saved: false }, null, 2);
    };

    document.getElementById('reg-btn').onclick = async () => {
      const data = await postJson('/api/register', {
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-pass').value,
        fullName: document.getElementById('reg-name').value
      });
      if (data.token) {
        tokenInput.value = data.token;
        localStorage.setItem(storageKey, data.token);
      }
      document.getElementById('output').textContent = JSON.stringify(data, null, 2);
    };

    document.getElementById('log-btn').onclick = async () => {
      const data = await postJson('/api/login', {
        email: document.getElementById('log-email').value,
        password: document.getElementById('log-pass').value
      });
      if (data.token) {
        tokenInput.value = data.token;
        localStorage.setItem(storageKey, data.token);
      }
      document.getElementById('output').textContent = JSON.stringify(data, null, 2);
    };

    document.getElementById('sample').onclick = () => {
      document.getElementById('query').value = [
        'query Assets($spaceMrn: String!, $labels: [KeyValueInput!]) {',
        '  assets(spaceMrn: $spaceMrn, first: 10, labels: $labels) {',
        '    totalCount',
        '    items { id name lifecycleState labels notes spaceMrn }',
        '  }',
        '}'
      ].join('\\n');
      document.getElementById('vars').value = JSON.stringify({
        spaceMrn: '//captain.api.arena.local/spaces/sp_demo_7f3c',
        labels: [{ key: 'distro-id', value: 'debian' }]
      }, null, 2);
    };

    document.getElementById('run').onclick = async () => {
      const token = tokenInput.value.trim() || localStorage.getItem(storageKey) || '';
      const body = {
        query: document.getElementById('query').value,
        variables: JSON.parse(document.getElementById('vars').value || '{}')
      };
      const res = await fetch('/query/ui', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {})
        },
        body: JSON.stringify(body)
      });
      document.getElementById('output').textContent = JSON.stringify(await res.json(), null, 2);
    };
  </script>
</body>
</html>`;
}

function normalizeLabels(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => ({
    key: String(item && item.key !== undefined ? item.key : ''),
    value: String(item && item.value !== undefined ? item.value : '')
  }));
}

function buildLabelPredicate(alias, label) {
  return `(${alias}.labels ->> '${sqlIdentifier(label.key)}' = ${sqlLiteral(label.value)})`;
}

function buildAssetWhere(spaceMrn, labels) {
  const clauses = [
    `a.space_mrn = ${sqlLiteral(spaceMrn)}`,
    `a.lifecycle_state = 'active'`
  ];
  for (const label of labels) {
    clauses.push(buildLabelPredicate('a', label));
  }
  return clauses.join(' AND ');
}

function getUserByEmail(email) {
  const rows = psqlRows(`SELECT id, email, password_hash, full_name, role, primary_space_mrn FROM users WHERE email = ${sqlLiteral(email)} LIMIT 1;`);
  if (rows.length === 0) return null;
  const [id, rowEmail, passwordHash, fullName, role, primarySpaceMrn] = rows[0];
  return { id, email: rowEmail, password_hash: passwordHash, full_name: fullName, role, primary_space_mrn: primarySpaceMrn };
}

function getSpacesForEmail(email) {
  const rows = psqlRows(`
    SELECT s.mrn, s.display_name, t.slug
    FROM spaces s
    JOIN users u ON u.id = s.owner_user_id
    JOIN tenants t ON t.id = s.tenant_id
    WHERE u.email = ${sqlLiteral(email)}
    ORDER BY s.mrn ASC;
  `);
  return rows.map(([mrn, displayName, tenantSlug]) => ({ mrn, displayName, tenantSlug }));
}

function userOwnsSpace(email, spaceMrn) {
  const sql = `
    SELECT 1
    FROM spaces s
    JOIN users u ON u.id = s.owner_user_id
    WHERE u.email = ${sqlLiteral(email)}
      AND s.mrn = ${sqlLiteral(spaceMrn)}
    LIMIT 1;
  `;
  return psqlScalar(sql) === '1';
}

function queryAssets(spaceMrn, first, labels) {
  const where = buildAssetWhere(spaceMrn, labels);
  const totalRows = psqlRows(`
    SELECT COUNT(*)::int::text
    FROM assets a
    WHERE ${where};
  `);
  const totalCount = Number(totalRows[0] ? totalRows[0][0] : '0') || 0;

  const itemRows = psqlRows(`
    SELECT a.id::text, a.name, a.lifecycle_state, a.labels::text, COALESCE(a.notes, ''), a.space_mrn
    FROM assets a
    WHERE ${where}
    ORDER BY a.id ASC
    LIMIT ${Number(first)}
  `);

  return {
    totalCount,
    items: itemRows.map(([id, name, lifecycleState, labelsText, notes, spaceMrnValue]) => ({
      id,
      name,
      lifecycleState,
      labels: labelsText,
      notes: notes || null,
      spaceMrn: spaceMrnValue
    }))
  };
}

function querySuggestions(spaceMrn, input) {
  const labels = normalizeLabels(input.labelFilter);
  const clauses = [buildAssetWhere(spaceMrn, labels)];
  if (input.query && String(input.query).trim()) {
    const q = sqlLiteral(String(input.query).trim());
    clauses.push(`(a.name ILIKE '%' || ${q} || '%' OR a.labels::text ILIKE '%' || ${q} || '%')`);
  }
  const limit = Math.min(Math.max(Number.parseInt(input.limit ?? 10, 10) || 10, 1), 25);
  const rows = psqlRows(`
    SELECT DISTINCT a.name
    FROM assets a
    WHERE ${clauses.join(' AND ')}
    ORDER BY a.name ASC
    LIMIT ${limit};
  `);
  return rows.map((row) => row[0]);
}

function readAuth(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const email = TOKENS.get(token);
  return email || null;
}

async function waitForDatabase() {
  for (let i = 0; i < 60; i += 1) {
    const error = psqlError('SELECT 1;');
    if (!error) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('database unavailable');
}

function handleRegister(req, res, body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const fullName = String(body.fullName || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { error: 'invalid email address' });
  }
  if (password.length < 8) {
    return json(res, 400, { error: 'password must be at least 8 characters' });
  }
  if (!fullName) {
    return json(res, 400, { error: 'full name is required' });
  }
  if (getUserByEmail(email)) {
    return json(res, 409, { error: 'email already registered' });
  }

  const tenantSlug = `tenant_${crypto.randomBytes(3).toString('hex')}`;
  const spaceMrn = `//captain.api.arena.local/spaces/sp_${crypto.randomBytes(4).toString('hex')}`;
  const passwordHash = hashPassword(password);

  const error = psqlError(`
    BEGIN;
    INSERT INTO tenants (slug, name) VALUES (${sqlLiteral(tenantSlug)}, ${sqlLiteral(`${fullName}'s Tenant`)});
    INSERT INTO users (email, password_hash, full_name, role, primary_space_mrn)
    VALUES (${sqlLiteral(email)}, ${sqlLiteral(passwordHash)}, ${sqlLiteral(fullName)}, 'member', ${sqlLiteral(spaceMrn)});
    INSERT INTO spaces (mrn, tenant_id, owner_user_id, display_name)
    VALUES (
      ${sqlLiteral(spaceMrn)},
      (SELECT id FROM tenants WHERE slug = ${sqlLiteral(tenantSlug)}),
      (SELECT id FROM users WHERE email = ${sqlLiteral(email)}),
      ${sqlLiteral(`${fullName} Space`)}
    );
    INSERT INTO assets (space_mrn, name, lifecycle_state, labels, notes)
    VALUES (
      ${sqlLiteral(spaceMrn)},
      ${sqlLiteral('Starter Asset')},
      'active',
      ${sqlLiteral(JSON.stringify({ 'distro-id': 'debian', owner: 'player', tier: 'starter' }))}::jsonb,
      ${sqlLiteral('Seeded row used for the baseline query.')}
    );
    COMMIT;
  `);

  if (error) {
    return json(res, 500, { error: 'registration failed', detail: error });
  }

  const token = issueToken(email);
  return json(res, 201, {
    token,
    user: { email, fullName, role: 'member', primarySpaceMrn: spaceMrn },
    primarySpaceMrn: spaceMrn
  });
}

function handleLogin(req, res, body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const passwordHash = hashPassword(password);
  const user = getUserByEmail(email);
  if (!user || user.password_hash !== passwordHash) {
    return json(res, 401, { error: 'invalid credentials' });
  }
  const token = issueToken(email);
  return json(res, 200, {
    token,
    user: {
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      primarySpaceMrn: user.primary_space_mrn
    }
  });
}

function handleQuery(req, res, body) {
  const email = readAuth(req);
  if (!email) {
    return json(res, 401, { error: 'authentication required' });
  }

  const query = String(body.query || '');
  const variables = body.variables && typeof body.variables === 'object' ? body.variables : {};

  if (!query.trim()) {
    return json(res, 400, { errors: [{ message: 'query string required' }] });
  }

  if (/assets\s*\(/.test(query)) {
    const spaceMrn = String(variables.spaceMrn || '');
    if (!spaceMrn || !userOwnsSpace(email, spaceMrn)) {
      return json(res, 403, { errors: [{ message: 'space not owned by authenticated user' }] });
    }
    const labels = normalizeLabels(variables.labels);
    try {
      return json(res, 200, {
        data: {
          assets: queryAssets(spaceMrn, variables.first || 10, labels)
        }
      });
    } catch (err) {
      return json(res, 200, { errors: [{ message: String(err.message || err) }] });
    }
  }

  if (/assetSearchSuggestions\s*\(/.test(query)) {
    const input = variables.input && typeof variables.input === 'object' ? variables.input : {};
    const spaceMrn = String(input.spaceMrn || '');
    if (!spaceMrn || !userOwnsSpace(email, spaceMrn)) {
      return json(res, 403, { errors: [{ message: 'space not owned by authenticated user' }] });
    }
    try {
      return json(res, 200, {
        data: {
          assetSearchSuggestions: querySuggestions(spaceMrn, input)
        }
      });
    } catch (err) {
      return json(res, 200, { errors: [{ message: String(err.message || err) }] });
    }
  }

  if (/^\s*query\s+Me\b/i.test(query) || /\bme\s*\{/.test(query)) {
    const user = getUserByEmail(email);
    if (!user) {
      return json(res, 401, { errors: [{ message: 'authentication required' }] });
    }
    const spaces = getSpacesForEmail(email);
    return json(res, 200, {
      data: {
        me: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          primarySpaceMrn: user.primary_space_mrn,
          spaces
        }
      }
    });
  }

  return json(res, 400, { errors: [{ message: 'unsupported query' }] });
}

async function main() {
  await waitForDatabase();

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && parsedUrl.pathname === '/') {
        res.writeHead(302, { Location: '/query/ui' });
        res.end();
        return;
      }

      if (req.method === 'GET' && parsedUrl.pathname === '/query/ui') {
        return text(res, 200, renderUi(), 'text/html; charset=utf-8');
      }

      if (req.method === 'GET' && parsedUrl.pathname === '/health') {
        const error = psqlError('SELECT 1;');
        if (error) {
          return json(res, 503, { status: 'db unavailable', detail: error });
        }
        return json(res, 200, { status: 'ok' });
      }

      if (req.method === 'POST' && parsedUrl.pathname === '/api/register') {
        const body = JSON.parse(await readBody(req) || '{}');
        return handleRegister(req, res, body);
      }

      if (req.method === 'POST' && parsedUrl.pathname === '/api/login') {
        const body = JSON.parse(await readBody(req) || '{}');
        return handleLogin(req, res, body);
      }

      if (req.method === 'POST' && parsedUrl.pathname === '/query/ui') {
        const body = JSON.parse(await readBody(req) || '{}');
        return handleQuery(req, res, body);
      }

      return json(res, 404, { error: 'not found' });
    } catch (err) {
      console.error('[server] error:', err);
      return json(res, 500, { error: 'internal error' });
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`labelkeysqli listening on ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[startup] fatal error:', err);
  process.exit(1);
});
