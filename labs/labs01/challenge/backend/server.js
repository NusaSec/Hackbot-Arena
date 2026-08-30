const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const db = require('./db');

const app = express();
const PORT = 3000;

// ============================================================
// Configuration
// ============================================================
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'bot-internal-token-do-not-leak';

// Reserved usernames that cannot be registered
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'bot', 'reviewer',
  'support', 'security', 'internal', 'service', 'api', 'staff',
  'moderator', 'mod', 'ops', 'devops', 'sysadmin'
]);

// ============================================================
// Middleware
// ============================================================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 4 // 4 hours
  }
}));

// Flash messages
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function requireAuth(req, res, next) {
  if (!req.session.username) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'authentication required' });
    }
    return res.redirect('/login');
  }
  next();
}

// ============================================================
// HTML helpers
// ============================================================
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderLayout({ title, body, user, flash, activeNav }) {
  const navItems = user
    ? [
        { href: '/', label: 'Dashboard', key: 'dashboard' },
        { href: '/account', label: 'Account', key: 'account' },
        { href: '/report', label: 'Report URL', key: 'report' }
      ]
    : [
        { href: '/login', label: 'Sign in', key: 'login' },
        { href: '/register', label: 'Register', key: 'register' }
      ];

  const navHtml = navItems
    .map(n => `<a href="${n.href}" class="nav-link${activeNav === n.key ? ' active' : ''}">${n.label}</a>`)
    .join('');

  const userMenu = user
    ? `<div class="user-menu">
         <span class="user-badge">${escapeHtml(user.username)}${user.role === 'admin' ? ' <span class="role-pill">admin</span>' : ''}</span>
         <a href="/logout" class="logout-link">Sign out</a>
       </div>`
    : '';

  const flashHtml = flash
    ? `<div class="flash flash-${flash.type}">${escapeHtml(flash.message)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Acme Internal Portal</title>
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <a href="/" class="brand">
      <span class="brand-mark">A</span>
      <span class="brand-text">Acme <em>Portal</em></span>
    </a>
    <nav class="primary-nav">${navHtml}</nav>
    ${userMenu}
  </div>
</header>
<main class="container">
  ${flashHtml}
  ${body}
</main>
<footer class="footer">
  <div class="footer-inner">
    <span>&copy; 2026 Acme Corporation</span>
    <span class="footer-sep">·</span>
    <span>Internal Use Only</span>
    <span class="footer-sep">·</span>
    <span>Build a3f9b2c</span>
  </div>
</footer>
</body>
</html>`;
}

// ============================================================
// Stylesheet (cacheable; intentionally lives at /static/style.css)
// ============================================================
app.get('/static/style.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.send(`
:root {
  --bg: #f6f7fb;
  --surface: #ffffff;
  --surface-2: #f0f2f7;
  --border: #e3e6ee;
  --text: #1c2230;
  --text-muted: #6b7280;
  --primary: #3a5bd9;
  --primary-hover: #2f4cc4;
  --success: #0e9f6e;
  --success-bg: #e3fbf0;
  --danger: #d8402c;
  --danger-bg: #fde7e3;
  --warning: #b08300;
  --warning-bg: #fff4d6;
  --info: #2563eb;
  --info-bg: #e3edff;
  --radius: 6px;
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.06);
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Helvetica Neue", sans-serif;
  font-size: 14px;
  line-height: 1.55;
}

a { color: var(--primary); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre, kbd { font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 0.92em; }
code { background: var(--surface-2); padding: 1px 5px; border-radius: 3px; }
pre { background: #1c2230; color: #e3e6ee; padding: 1em 1.2em; border-radius: var(--radius); overflow-x: auto; }
pre code { background: transparent; padding: 0; color: inherit; }

/* ===== Top bar ===== */
.topbar { background: var(--surface); border-bottom: 1px solid var(--border); box-shadow: var(--shadow-sm); }
.topbar-inner { max-width: 1080px; margin: 0 auto; padding: 0 24px; height: 56px; display: flex; align-items: center; gap: 24px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; color: var(--text); }
.brand:hover { text-decoration: none; }
.brand-mark { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: var(--primary); color: #fff; border-radius: 6px; font-weight: 700; font-size: 14px; }
.brand-text em { color: var(--text-muted); font-style: normal; font-weight: 400; }

.primary-nav { display: flex; gap: 4px; flex: 1; }
.nav-link { padding: 6px 12px; border-radius: 6px; color: var(--text-muted); font-size: 13px; font-weight: 500; }
.nav-link:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
.nav-link.active { background: var(--surface-2); color: var(--text); }

.user-menu { display: flex; align-items: center; gap: 12px; font-size: 13px; }
.user-badge { color: var(--text); font-weight: 500; }
.role-pill { display: inline-block; background: var(--success-bg); color: var(--success); padding: 1px 7px; border-radius: 9999px; font-size: 11px; font-weight: 600; margin-left: 4px; }
.logout-link { color: var(--text-muted); }

/* ===== Container ===== */
.container { max-width: 1080px; margin: 0 auto; padding: 32px 24px 64px; }

/* ===== Cards ===== */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px 28px; margin-bottom: 20px; box-shadow: var(--shadow-sm); }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
.card-header h2 { margin: 0; font-size: 16px; font-weight: 600; }
.card-header .subtitle { color: var(--text-muted); font-size: 12px; margin-top: 2px; }
.card h3 { font-size: 14px; margin: 0 0 12px; font-weight: 600; }

/* ===== Page header ===== */
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 22px; margin: 0 0 4px; font-weight: 600; }
.page-header p { margin: 0; color: var(--text-muted); font-size: 13px; }

/* ===== Forms ===== */
.form-row { margin-bottom: 16px; }
.form-row label { display: block; font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
.form-row .hint { display: block; font-size: 12px; color: var(--text-muted); margin-top: 4px; font-weight: 400; text-transform: none; letter-spacing: 0; }
input[type=text], input[type=email], input[type=password], textarea {
  width: 100%; padding: 8px 12px; font-size: 13px;
  border: 1px solid var(--border); border-radius: 5px;
  background: var(--surface); color: var(--text); font-family: inherit;
}
input[type=text]:focus, input[type=email]:focus, input[type=password]:focus, textarea:focus {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(58, 91, 217, 0.15);
}
textarea { resize: vertical; min-height: 80px; }

button, .btn {
  display: inline-block; padding: 8px 16px; font-size: 13px; font-weight: 600;
  border: none; border-radius: 5px; cursor: pointer;
  background: var(--primary); color: #fff; transition: background 0.15s; font-family: inherit;
}
button:hover, .btn:hover { background: var(--primary-hover); text-decoration: none; color: #fff; }
.btn-secondary { background: var(--surface-2); color: var(--text); }
.btn-secondary:hover { background: var(--border); color: var(--text); }

.form-actions { display: flex; gap: 8px; align-items: center; }
.form-actions .helper { color: var(--text-muted); font-size: 12px; }

/* ===== Flash messages ===== */
.flash { padding: 10px 14px; border-radius: 5px; margin-bottom: 16px; font-size: 13px; border: 1px solid transparent; }
.flash-success { background: var(--success-bg); color: var(--success); border-color: rgba(14, 159, 110, 0.2); }
.flash-error { background: var(--danger-bg); color: var(--danger); border-color: rgba(216, 64, 44, 0.2); }
.flash-info { background: var(--info-bg); color: var(--info); border-color: rgba(37, 99, 235, 0.2); }
.flash-warning { background: var(--warning-bg); color: var(--warning); border-color: rgba(176, 131, 0, 0.2); }

/* ===== Tables ===== */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); }
th { font-weight: 600; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; background: var(--surface-2); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--surface-2); }

/* ===== Profile fields ===== */
.field-grid { display: grid; grid-template-columns: 160px 1fr; gap: 12px 24px; font-size: 13px; }
.field-grid dt { color: var(--text-muted); font-weight: 500; }
.field-grid dd { margin: 0; color: var(--text); }
.field-grid dd code { background: var(--surface-2); padding: 3px 7px; border-radius: 4px; word-break: break-all; }

/* ===== Status badges ===== */
.badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
.badge-success { background: var(--success-bg); color: var(--success); }
.badge-error { background: var(--danger-bg); color: var(--danger); }
.badge-muted { background: var(--surface-2); color: var(--text-muted); }

/* ===== Auth pages (login/register) ===== */
.auth-wrapper { max-width: 400px; margin: 48px auto 0; }
.auth-wrapper .card { padding: 32px; }
.auth-wrapper h1 { font-size: 20px; margin: 0 0 6px; font-weight: 600; }
.auth-wrapper .subtitle { color: var(--text-muted); margin: 0 0 24px; font-size: 13px; }
.auth-footer { text-align: center; margin-top: 16px; font-size: 13px; color: var(--text-muted); }

/* ===== Stats grid ===== */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; }
.stat-card .label { color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-bottom: 4px; }
.stat-card .value { font-size: 20px; font-weight: 600; color: var(--text); }

/* ===== Footer ===== */
.footer { border-top: 1px solid var(--border); background: var(--surface); margin-top: 48px; }
.footer-inner { max-width: 1080px; margin: 0 auto; padding: 16px 24px; color: var(--text-muted); font-size: 12px; }
.footer-sep { margin: 0 8px; opacity: 0.5; }

/* ===== Misc ===== */
.muted { color: var(--text-muted); }
.text-sm { font-size: 12px; }
.mono { font-family: "SF Mono", Menlo, Consolas, monospace; }
.divider { height: 1px; background: var(--border); margin: 16px 0; border: 0; }
`);
});

app.get('/static/favicon.svg', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#3a5bd9"/><text x="16" y="22" text-anchor="middle" fill="white" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="18">A</text></svg>`);
});

// ============================================================
// Public routes
// ============================================================
app.get('/', (req, res) => {
  const username = req.session.username;
  const user = username ? db.getUser(username) : null;
  const flash = res.locals.flash;

  let body;
  if (user) {
    const submissionsCount = db.countUserHistory(username);
    body = `
      <div class="page-header">
        <h1>Welcome back, ${escapeHtml(user.username)}</h1>
        <p>Acme internal tools dashboard</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="label">Account role</div>
          <div class="value">${escapeHtml(user.role)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Department</div>
          <div class="value">${escapeHtml(user.department || '—')}</div>
        </div>
        <div class="stat-card">
          <div class="label">Your submissions</div>
          <div class="value">${submissionsCount}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h2>Quick links</h2>
            <div class="subtitle">Common tasks for internal users</div>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Action</th><th>Endpoint</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>View account</td>
              <td><a href="/account">/account</a></td>
              <td>Your profile, role, and API key</td>
            </tr>
            <tr>
              <td>Report URL</td>
              <td><a href="/report">/report</a></td>
              <td>Flag a problematic URL for admin review</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h2>System notice</h2>
            <div class="subtitle">From IT operations</div>
          </div>
        </div>
        <p class="muted">We've made some performance improvements to the portal. In rare cases, recently updated content may take a moment to appear. Reload the page if anything looks unusual.</p>
      </div>
    `;
  } else {
    body = `
      <div class="page-header">
        <h1>Acme Internal Portal</h1>
        <p>Sign in to access your account, or register to request access.</p>
      </div>
      <div class="card">
        <h3>Get started</h3>
        <p>Use your corporate credentials to sign in. New external users can request access by registering.</p>
        <div class="form-actions">
          <a href="/login" class="btn">Sign in</a>
          <a href="/register" class="btn btn-secondary">Create account</a>
        </div>
      </div>
    `;
  }

  res.send(renderLayout({ title: 'Dashboard', body, user, flash, activeNav: 'dashboard' }));
});

// ============================================================
// Login
// ============================================================
app.get('/login', (req, res) => {
  if (req.session.username) return res.redirect('/');
  const flash = res.locals.flash;
  const body = `
    <div class="auth-wrapper">
      <div class="card">
        <h1>Sign in</h1>
        <p class="subtitle">Use your Acme account credentials</p>
        <form method="POST" action="/login">
          <div class="form-row">
            <label for="username">Username</label>
            <input id="username" name="username" type="text" autocomplete="username" required>
          </div>
          <div class="form-row">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required>
          </div>
          <div class="form-actions">
            <button type="submit">Sign in</button>
            <span class="helper">or <a href="/register">create an account</a></span>
          </div>
        </form>
      </div>
    </div>
  `;
  res.send(renderLayout({ title: 'Sign in', body, user: null, flash, activeNav: 'login' }));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    setFlash(req, 'error', 'Username and password are required.');
    return res.redirect('/login');
  }
  const user = db.getUser(username);
  if (!user || user.password !== password) {
    setFlash(req, 'error', 'Invalid username or password.');
    return res.redirect('/login');
  }
  req.session.username = username;
  setFlash(req, 'success', `Signed in as ${username}.`);
  res.redirect('/');
});

// ============================================================
// Registration
// ============================================================
app.get('/register', (req, res) => {
  if (req.session.username) return res.redirect('/');
  const flash = res.locals.flash;
  const body = `
    <div class="auth-wrapper">
      <div class="card">
        <h1>Create account</h1>
        <p class="subtitle">Request access to the Acme portal</p>
        <form method="POST" action="/register">
          <div class="form-row">
            <label for="username">Username</label>
            <input id="username" name="username" type="text" autocomplete="username" required>
            <span class="hint">3–20 characters, letters/digits/underscore. Reserved names rejected.</span>
          </div>
          <div class="form-row">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" required>
          </div>
          <div class="form-row">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="new-password" required>
            <span class="hint">Minimum 6 characters.</span>
          </div>
          <div class="form-actions">
            <button type="submit">Create account</button>
            <span class="helper">or <a href="/login">sign in</a></span>
          </div>
        </form>
      </div>
    </div>
  `;
  res.send(renderLayout({ title: 'Register', body, user: null, flash, activeNav: 'register' }));
});

app.post('/register', (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    setFlash(req, 'error', 'All fields are required.');
    return res.redirect('/register');
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    setFlash(req, 'error', 'Username must be 3–20 characters: letters, digits, underscore only.');
    return res.redirect('/register');
  }
  if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    setFlash(req, 'error', 'That username is reserved. Please choose another.');
    return res.redirect('/register');
  }
  if (db.getUser(username)) {
    setFlash(req, 'error', 'Username already taken.');
    return res.redirect('/register');
  }
  if (password.length < 6) {
    setFlash(req, 'error', 'Password must be at least 6 characters.');
    return res.redirect('/register');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFlash(req, 'error', 'Invalid email format.');
    return res.redirect('/register');
  }

  try {
    db.createUser({ username, password, email });
  } catch (e) {
    setFlash(req, 'error', 'Could not create account. Try a different username.');
    return res.redirect('/register');
  }

  req.session.username = username;
  setFlash(req, 'success', `Welcome, ${username}! Your account is ready.`);
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ============================================================
// Account endpoints
// ============================================================
app.get(/^\/api\/account(\/.*)?$/, requireAuth, (req, res) => {
  const user = db.getUser(req.session.username);
  if (!user) return res.status(401).json({ error: 'session invalid' });

  const { password, ...profile } = user;
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    profile,
    server_time: new Date().toISOString()
  });
});

app.get('/account', requireAuth, async (req, res) => {
  const selfBase = process.env.SELF_BASE_URL || `http://127.0.0.1:${PORT}`;
  let profile;

  try {
    const apiRes = await fetch(`${selfBase}/api/account`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cookie': req.headers.cookie || ''
      },
      redirect: 'manual'
    });

    if (!apiRes.ok) {
      throw new Error(`/api/account returned HTTP ${apiRes.status}`);
    }

    const data = await apiRes.json();
    profile = data.profile;
  } catch (e) {
    console.error(`[account] internal fetch failed: ${e.message}`);
    const sessionUser = db.getUser(req.session.username);
    return res.status(503).send(renderLayout({
      title: 'Service Unavailable',
      body: `
        <div class="page-header">
          <h1>Service Unavailable</h1>
          <p>Could not reach the account service. Please try again shortly.</p>
        </div>
        <div class="card"><p><a href="/">← Back to dashboard</a></p></div>
      `,
      user: sessionUser,
      flash: null,
      activeNav: 'account'
    }));
  }

  const flash = res.locals.flash;
  const body = `
    <div class="page-header">
      <h1>Account profile</h1>
      <p>Personal details and API credentials for ${escapeHtml(profile.username)}</p>
    </div>
    <div class="card">
      <div class="card-header">
        <div>
          <h2>Profile</h2>
          <div class="subtitle">View-only. Contact IT to update.</div>
        </div>
      </div>
      <dl class="field-grid">
        <dt>Username</dt><dd>${escapeHtml(profile.username)}</dd>
        <dt>Email</dt><dd>${escapeHtml(profile.email)}</dd>
        <dt>Role</dt><dd>${escapeHtml(profile.role)}</dd>
        <dt>Department</dt><dd>${escapeHtml(profile.department || '—')}</dd>
        <dt>API key</dt><dd><code>${escapeHtml(profile.api_key)}</code></dd>
        <dt>Created</dt><dd>${escapeHtml(profile.created_at)}</dd>
        <dt>Notes</dt><dd>${escapeHtml(profile.notes || '')}</dd>
      </dl>
    </div>
    <div class="card">
      <h3>Programmatic access</h3>
      <p class="muted">The same data is available as JSON for client-side integrations.</p>
      <pre><code>GET /api/account
Cookie: connect.sid=&lt;your session&gt;</code></pre>
      <p><a href="/api/account">Open /api/account</a></p>
    </div>
  `;
  res.send(renderLayout({ title: 'Account', body, user: profile, flash, activeNav: 'account' }));
});

// ============================================================
// Report endpoint
//
// Per-user history filtering: each user only sees their own
// submissions in "Recent admin visits". This prevents leaking
// other players' attack paths.
// ============================================================
app.get('/report', requireAuth, (req, res) => {
  const user = db.getUser(req.session.username);
  const flash = res.locals.flash;
  const recent = db.getUserHistory(user.username, 10);

  const recentRows = recent.length
    ? recent.map(r => `
        <tr>
          <td><code>${escapeHtml(r.url)}</code></td>
          <td>
            <span class="badge ${r.status >= 200 && r.status < 400 ? 'badge-success' : 'badge-error'}">
              HTTP ${r.status}
            </span>
          </td>
          <td class="muted text-sm">${escapeHtml(r.visited_at)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="muted" style="text-align:center;padding:24px">You haven't submitted any URLs yet.</td></tr>`;

  const body = `
    <div class="page-header">
      <h1>Report a URL</h1>
      <p>Flag a problematic page for admin review. The reviewer visits each URL while authenticated and reports back.</p>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2>Submit URL</h2>
          <div class="subtitle">Provide a path on this site or a full URL with the same host.</div>
        </div>
      </div>
      <form method="POST" action="/report">
        <div class="form-row">
          <label for="url">URL to review</label>
          <input id="url" name="url" type="text" placeholder="/some/path" required>
          <span class="hint">Examples: <code>/account</code>, <code>/api/account</code>, or full URL on this host.</span>
        </div>
        <div class="form-actions">
          <button type="submit">Submit for review</button>
          <span class="helper">Reviewer polls the queue every 5 seconds.</span>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2>Your recent submissions</h2>
          <div class="subtitle">Only your own submissions are shown</div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>URL</th><th>Result</th><th>When</th></tr>
        </thead>
        <tbody>${recentRows}</tbody>
      </table>
    </div>
  `;
  res.send(renderLayout({ title: 'Report', body, user, flash, activeNav: 'report' }));
});

app.post('/report', requireAuth, (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string' || url.length > 500) {
    setFlash(req, 'error', 'Invalid URL.');
    return res.redirect('/report');
  }

  let pathToVisit;
  try {
    if (url.startsWith('/')) {
      pathToVisit = url;
    } else {
      const parsed = new URL(url);
      pathToVisit = parsed.pathname + parsed.search + parsed.hash;
    }
  } catch (e) {
    setFlash(req, 'error', 'Invalid URL format.');
    return res.redirect('/report');
  }

  db.enqueueReport(pathToVisit, req.session.username);
  setFlash(req, 'success', `Submitted: ${pathToVisit}. Admin will review within ~10 seconds.`);
  res.redirect('/report');
});

// ============================================================
// Internal endpoints (used by the admin bot)
// ============================================================
app.get('/internal/queue/next', (req, res) => {
  const token = req.headers['x-internal-token'];
  if (token !== INTERNAL_TOKEN) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const task = db.dequeueReport();
  res.json({ task: task || null });
});

app.post('/internal/queue/result', (req, res) => {
  const token = req.headers['x-internal-token'];
  if (token !== INTERNAL_TOKEN) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { url, status, submitted_by } = req.body;
  db.addHistory({ url, status, submitted_by });
  res.json({ ok: true });
});

// ============================================================
// 404 fallback
// ============================================================
app.use((req, res) => {
  const username = req.session.username;
  const user = username ? db.getUser(username) : null;
  const body = `
    <div class="page-header">
      <h1>404 — Not found</h1>
      <p>The page <code>${escapeHtml(req.path)}</code> doesn't exist.</p>
    </div>
    <div class="card">
      <p><a href="/">Back to dashboard</a></p>
    </div>
  `;
  res.status(404).send(renderLayout({ title: 'Not found', body, user, flash: null, activeNav: null }));
});

// ============================================================
// Start
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend listening on port ${PORT}`);
  console.log(`DB path: ${process.env.DB_PATH || '/data/ctf.db'}`);
  console.log(`Reserved usernames: ${[...RESERVED_USERNAMES].join(', ')}`);
});
