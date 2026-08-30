// ============================================================
// Tahuna — wealth management backend
// ============================================================
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const db = require('./db');
const jwt = require('./auth/jwt');
const apiRoutes = require('./routes/api');

const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
app.set('trust proxy', 1);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({ limit: '1mb' }));

app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: '1h'
}));

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

// ============================================================
// Public pages — login/register/app
// ============================================================
function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Masuk · Tahuna</title>
<link rel="stylesheet" href="/static/app.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head><body class="auth-body">
<div class="auth-card">
  <div class="auth-brand">
    <div class="brand-mark"><span>T</span></div>
    <div class="brand-text">tahuna<em>.invest</em></div>
  </div>
  <h1 class="auth-title">Masuk ke akun Anda</h1>
  <p class="auth-sub">Dashboard manajemen kekayaan · PT Sinar Investasi</p>
  ${error ? '<div class="alert alert-error">' + escapeHtml(error) + '</div>' : ''}
  <form id="login-form">
    <label class="auth-label">Username</label>
    <input class="auth-input" type="text" name="username" required autofocus>
    <label class="auth-label">Password</label>
    <input class="auth-input" type="password" name="password" required>
    <button class="auth-btn" type="submit">Masuk</button>
  </form>
  <p class="auth-foot">Belum punya akun? <a href="/register">Daftar di sini</a></p>
  <p class="auth-foot" style="margin-top:18px;font-size:12px;opacity:0.7">
    Demo: <code>demo_widya</code> / <code>Demo123!</code>
  </p>
</div>
<script>
document.getElementById('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') })
  });
  const data = await res.json();
  if (res.ok && data.token) {
    localStorage.setItem('tahuna_token', data.token);
    location.href = '/app';
  } else {
    document.querySelectorAll('.alert').forEach(e => e.remove());
    const a = document.createElement('div');
    a.className = 'alert alert-error';
    a.textContent = data.error || 'Login gagal.';
    document.querySelector('h1.auth-title').after(a);
  }
});
</script>
</body></html>`;
}

function registerPage(error) {
  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daftar · Tahuna</title>
<link rel="stylesheet" href="/static/app.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head><body class="auth-body">
<div class="auth-card">
  <div class="auth-brand">
    <div class="brand-mark"><span>T</span></div>
    <div class="brand-text">tahuna<em>.invest</em></div>
  </div>
  <h1 class="auth-title">Daftar akun</h1>
  <p class="auth-sub">Mulai kelola portofolio investasi Anda.</p>
  ${error ? '<div class="alert alert-error">' + escapeHtml(error) + '</div>' : ''}
  <form id="register-form">
    <label class="auth-label">Username</label>
    <input class="auth-input" type="text" name="username" required pattern="[a-zA-Z0-9_]{3,20}" placeholder="3-20 char, alphanumeric + underscore">
    <label class="auth-label">Nama Lengkap</label>
    <input class="auth-input" type="text" name="full_name" required>
    <label class="auth-label">Email</label>
    <input class="auth-input" type="email" name="email" required>
    <label class="auth-label">Password</label>
    <input class="auth-input" type="password" name="password" required minlength="6">
    <button class="auth-btn" type="submit">Daftar</button>
  </form>
  <p class="auth-foot">Sudah punya akun? <a href="/login">Masuk di sini</a></p>
</div>
<script>
document.getElementById('register-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: fd.get('username'),
      password: fd.get('password'),
      full_name: fd.get('full_name'),
      email: fd.get('email')
    })
  });
  const data = await res.json();
  if (res.ok && data.token) {
    localStorage.setItem('tahuna_token', data.token);
    location.href = '/app';
  } else {
    document.querySelectorAll('.alert').forEach(e => e.remove());
    const a = document.createElement('div');
    a.className = 'alert alert-error';
    a.textContent = data.error || 'Gagal mendaftar.';
    document.querySelector('h1.auth-title').after(a);
  }
});
</script>
</body></html>`;
}

function appShell() {
  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tahuna Dashboard</title>
<link rel="stylesheet" href="/static/app.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head><body>
<div id="app-root"></div>
<script src="/static/app.js"></script>
</body></html>`;
}

// ============================================================
// Routes
// ============================================================
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.send(loginPage(req.query.error)));
app.get('/register', (req, res) => res.send(registerPage(req.query.error)));
app.get('/app', (req, res) => res.send(appShell()));
app.get('/logout', (req, res) => {
  res.send(`<script>localStorage.removeItem('tahuna_token');location.href='/login';</script>`);
});

// ============================================================
// JWKS — public key discovery
// Standard well-known endpoint per RFC 7517.
// ============================================================
app.get('/.well-known/jwks.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ keys: [jwt.getJwk()] });
});

// ============================================================
// Auth API
// ============================================================
app.post('/api/auth/register', (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const fullName = String((req.body && req.body.full_name) || '').trim();
  const email = String((req.body && req.body.email) || '').trim();

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username tidak valid (3-20 char, alphanumeric + underscore).' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email tidak valid.' });
  }
  if (!fullName) {
    return res.status(400).json({ error: 'Nama lengkap wajib diisi.' });
  }
  if (db.getUserByUsername(username)) {
    return res.status(409).json({ error: 'Username sudah dipakai.' });
  }

  try {
    const r = db.createUser(username, db.hashPassword(password), fullName, email);
    const userId = r.lastInsertRowid;
    const token = jwt.sign({ sub: userId, role: 'client', username, name: fullName });
    res.json({ token, expires_in: 28800 });
  } catch (e) {
    res.status(500).json({ error: 'Gagal mendaftar.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }
  const user = db.getUserByUsername(username);
  if (!user || user.password !== db.hashPassword(password)) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }
  const token = jwt.sign({ sub: user.id, role: user.role, username: user.username, name: user.full_name });
  res.json({ token, expires_in: 28800 });
});

// ============================================================
// Public/system endpoints
// ============================================================
app.get('/api/system/version', (req, res) => {
  res.json({
    service: 'tahuna-wealth-api',
    version: '1.6.2',
    released_at: '2026-05-10',
    api_doc: '/docs/api'
  });
});

app.get('/api/system/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Compatibility doc page — internal reference
app.get('/docs/api', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Tahuna API — Docs</title>
<link rel="stylesheet" href="/static/app.css">
</head><body class="doc-body">
<div class="doc-container">
<h1>Tahuna API — Developer Reference</h1>
<p class="doc-sub">Wealth management API v1.6.2 · Internal &amp; partner integration</p>

<h2>Authentication</h2>
<p>API menggunakan JWT Bearer authentication. Login via <code>POST /api/auth/login</code> untuk mendapat token, lalu sertakan di header <code>Authorization: Bearer &lt;token&gt;</code> untuk setiap request.</p>

<h3>Token format</h3>
<p>JWT standar (RFC 7519). Default signing algorithm: <strong>RS256</strong> (asymmetric, RSA-2048).</p>
<p>Untuk kompatibilitas dengan legacy mobile client pre-v1.4, verifier juga menerima <strong>HS256</strong> algorithm. Klien baru tidak perlu menggunakan HS256.</p>

<h3>Public key discovery</h3>
<p>Public key untuk RS256 verification tersedia di endpoint standar JWKS:</p>
<pre><code>GET /.well-known/jwks.json</code></pre>

<h2>Endpoints</h2>
<table class="doc-table">
<thead><tr><th>Method</th><th>Path</th><th>Description</th><th>Auth</th></tr></thead>
<tbody>
<tr><td>POST</td><td><code>/api/auth/register</code></td><td>Buat akun client baru</td><td>—</td></tr>
<tr><td>POST</td><td><code>/api/auth/login</code></td><td>Login, return JWT</td><td>—</td></tr>
<tr><td>GET</td><td><code>/api/me</code></td><td>Profil user saat ini</td><td>Bearer</td></tr>
<tr><td>GET</td><td><code>/api/portfolios</code></td><td>Daftar portofolio milik user</td><td>Bearer</td></tr>
<tr><td>GET</td><td><code>/api/portfolios/:id</code></td><td>Detail portofolio + holdings</td><td>Bearer</td></tr>
<tr><td>GET</td><td><code>/api/portfolios/:id/transactions</code></td><td>Riwayat transaksi</td><td>Bearer</td></tr>
<tr><td>GET</td><td><code>/api/watchlist</code></td><td>Watchlist user</td><td>Bearer</td></tr>
<tr><td>POST</td><td><code>/api/watchlist</code></td><td>Tambah simbol ke watchlist</td><td>Bearer</td></tr>
<tr><td>DELETE</td><td><code>/api/watchlist/:symbol</code></td><td>Hapus dari watchlist</td><td>Bearer</td></tr>
<tr><td>GET</td><td><code>/api/market/notes</code></td><td>Market research notes</td><td>Bearer</td></tr>
<tr><td>GET</td><td><code>/api/admin/users</code></td><td>Daftar semua user (admin only)</td><td>Bearer + role=admin</td></tr>
<tr><td>GET</td><td><code>/api/admin/treasury/secrets</code></td><td>Treasury runtime secrets (admin only)</td><td>Bearer + role=admin</td></tr>
</tbody>
</table>

<h2>Error responses</h2>
<p>Semua endpoint return JSON. HTTP status mengikuti konvensi standar: <code>2xx</code> success, <code>4xx</code> client error, <code>5xx</code> server error.</p>

<h2>Kontak</h2>
<p>Untuk integration support: <code>[email protected]</code></p>
</div>
</body></html>`);
});

// ============================================================
// Mount API routes
// ============================================================
apiRoutes(app, { db, jwt });

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
  console.log(`[tahuna] backend listening on port ${PORT}`);
  console.log(`[tahuna] DB: ${db.db.name}`);
  console.log(`[tahuna] JWT key id: ${jwt.KEY_ID}`);
});
