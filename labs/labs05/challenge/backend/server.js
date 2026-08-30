// ============================================================
// Talenta — backend server
// ============================================================
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const { parse, validate, execute } = require('graphql');
const schema = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');
const db = require('./db');

const PORT = parseInt(process.env.PORT || '3000', 10);
const SESSION_SECRET = process.env.SESSION_SECRET || 'talenta-dev-secret';

const app = express();
app.set('trust proxy', 1);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }
}));

app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: '1h'
}));

// ============================================================
// Auth helpers
// ============================================================
function hashPassword(p) {
  return crypto.createHash('sha256').update(p + '|talenta-salt-v2').digest('hex');
}

function apiAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'authentication required' });
  }
  const user = db.getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'session invalid' });
  }
  req.user = user;
  next();
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

// ============================================================
// Pages — login + register
// ============================================================
function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Masuk · Talenta</title>
<link rel="stylesheet" href="/static/app.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head><body class="auth-body">
<div class="auth-card">
  <div class="auth-brand">
    <div class="brand-mark"><span>T</span></div>
    <div class="brand-text">talenta<em>.hr</em></div>
  </div>
  <h1 class="auth-title">Masuk ke Talenta</h1>
  <p class="auth-sub">Portal HR &amp; Employee Directory · PT Surya Persada</p>
  ${error ? '<div class="alert alert-error">' + escapeHtml(error) + '</div>' : ''}
  <form method="POST" action="/login">
    <label class="auth-label">Username</label>
    <input class="auth-input" type="text" name="username" required autofocus>
    <label class="auth-label">Password</label>
    <input class="auth-input" type="password" name="password" required>
    <button class="auth-btn" type="submit">Masuk</button>
  </form>
  <p class="auth-foot">Belum punya akun karyawan? <a href="/register">Daftar di sini</a></p>
</div>
</body></html>`;
}

function registerPage(error) {
  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daftar · Talenta</title>
<link rel="stylesheet" href="/static/app.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head><body class="auth-body">
<div class="auth-card">
  <div class="auth-brand">
    <div class="brand-mark"><span>T</span></div>
    <div class="brand-text">talenta<em>.hr</em></div>
  </div>
  <h1 class="auth-title">Daftar akun</h1>
  <p class="auth-sub">Buat akun untuk akses HR portal.</p>
  ${error ? '<div class="alert alert-error">' + escapeHtml(error) + '</div>' : ''}
  <form method="POST" action="/register">
    <label class="auth-label">Username</label>
    <input class="auth-input" type="text" name="username" required pattern="[a-zA-Z0-9_]{3,20}" placeholder="3-20 karakter, alphanumeric + underscore">
    <label class="auth-label">Password</label>
    <input class="auth-input" type="password" name="password" required minlength="6">
    <button class="auth-btn" type="submit">Daftar</button>
  </form>
  <p class="auth-foot">Sudah punya akun? <a href="/login">Masuk di sini</a></p>
</div>
</body></html>`;
}

function appShell(user) {
  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Talenta · HR Portal</title>
<link rel="stylesheet" href="/static/app.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head><body>
<div id="app-root"></div>
<script>
window.__TALENTA__ = {
  user: ${JSON.stringify({ id: user.id, username: user.username, role: user.role })},
  apiPath: '/api/graphql'
};
</script>
<script src="/static/app.js"></script>
</body></html>`;
}

// ============================================================
// Auth routes
// ============================================================
app.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/app');
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/app');
  res.send(loginPage(req.query.error));
});

app.post('/login', (req, res) => {
  const username = (req.body.username || '').toString().trim();
  const password = (req.body.password || '').toString();
  if (!username || !password) {
    return res.redirect('/login?error=' + encodeURIComponent('Username dan password wajib diisi.'));
  }
  const user = db.getUserByUsername(username);
  if (!user || user.password !== hashPassword(password)) {
    return res.redirect('/login?error=' + encodeURIComponent('Username atau password salah.'));
  }
  req.session.userId = user.id;
  res.redirect('/app');
});

app.get('/register', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/app');
  res.send(registerPage(req.query.error));
});

app.post('/register', (req, res) => {
  const username = (req.body.username || '').toString().trim();
  const password = (req.body.password || '').toString();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.redirect('/register?error=' + encodeURIComponent('Username tidak valid (3-20 char, alphanumeric + underscore).'));
  }
  if (password.length < 6) {
    return res.redirect('/register?error=' + encodeURIComponent('Password minimal 6 karakter.'));
  }
  if (db.getUserByUsername(username)) {
    return res.redirect('/register?error=' + encodeURIComponent('Username sudah dipakai.'));
  }
  try {
    const r = db.createUser(username, hashPassword(password));
    req.session.userId = r.lastInsertRowid;
    res.redirect('/app');
  } catch (e) {
    res.redirect('/register?error=' + encodeURIComponent('Gagal mendaftar.'));
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ============================================================
// App shell
// ============================================================
app.get('/app', (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  const user = db.getUserById(req.session.userId);
  if (!user) { req.session.destroy(() => {}); return res.redirect('/login'); }
  res.send(appShell(user));
});

// ============================================================
// GraphQL endpoint
// ============================================================
async function handleGraphQL(req, res) {
  try {
    let query, variables, operationName;
    if (req.method === 'POST') {
      ({ query, variables, operationName } = req.body || {});
    } else {
      query = req.query.query;
      variables = req.query.variables ? JSON.parse(req.query.variables) : undefined;
      operationName = req.query.operationName;
    }

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ errors: [{ message: 'query string required' }] });
    }

    let document;
    try {
      document = parse(query);
    } catch (e) {
      return res.json({ errors: [{ message: 'Syntax error: ' + e.message }] });
    }

    const validationErrors = validate(schema, document);
    if (validationErrors.length > 0) {
      return res.json({
        errors: validationErrors.map(e => ({ message: e.message, locations: e.locations }))
      });
    }

    const result = await execute({
      schema,
      document,
      rootValue: resolvers,
      contextValue: { user: req.user, db },
      variableValues: variables,
      operationName
    });

    res.json(result);
  } catch (e) {
    console.error('[graphql] error:', e);
    res.status(500).json({ errors: [{ message: 'internal error' }] });
  }
}

app.post('/api/graphql', apiAuth, handleGraphQL);
app.get('/api/graphql', apiAuth, handleGraphQL);

// ============================================================
// REST endpoints (public + internal)
// ============================================================
app.get('/api/system/version', (req, res) => {
  res.json({
    service: 'talenta-hr-portal',
    version: '2.4.1',
    released_at: '2026-05-15'
  });
});

app.get('/api/system/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Internal build manifest. Documents the audit_key needed to call _systemAudit.
// Behind session auth — assumption is "only employees can see this".
app.get('/api/internal/build-manifest', apiAuth, (req, res) => {
  res.json({
    build_id: 'talenta-prod-2026.05.15-7a2c4f',
    released_at: '2026-05-15T08:00:00Z',
    node_version: process.version,
    git_commit: '7a2c4f1d8e9b0c3a5f6e2d4b8c1a9e7f',
    audit_key: db.AUDIT_KEY,
    comment: 'Build manifest for ops diagnostics. audit_key is used for the _systemAudit GraphQL query. Do not distribute outside ops team.'
  });
});

// ============================================================
// 404 + error
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`[talenta] backend listening on port ${PORT}`);
  console.log(`[talenta] DB: ${db.db.name}`);
  console.log(`[talenta] GraphQL: /api/graphql`);
});
