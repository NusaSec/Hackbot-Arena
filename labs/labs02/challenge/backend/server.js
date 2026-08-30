const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const swaggerUi = require('swagger-ui-express');

const db = require('./db');
const rotation = require('./rotation');
const openapiSpec = require('./openapi');
const { escapeHtml, renderShell } = require('./layout');

const app = express();
const server = http.createServer(app);

const PORT = 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me';
const FLAG = process.env.FLAG || 'FLAG{nusasec-not-set}';
const START_TIME = Date.now();

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'service', 'svc',
  'vault', 'vault-keeper', 'vaultkeeper', 'api', 'internal'
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
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 4 }
}));

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
    return res.redirect('/login');
  }
  next();
}

// ============================================================
// Static assets
// ============================================================
app.get('/static/style.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.sendFile(path.join(__dirname, 'style.css'));
});

app.get('/static/favicon.svg', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#635bff"/><text x="16" y="22" text-anchor="middle" fill="white" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="18">A</text></svg>`);
});

// ============================================================
// Auth: login / register / logout
// ============================================================
app.get('/login', (req, res) => {
  if (req.session.username) return res.redirect('/');
  const flash = res.locals.flash;
  const body = `
    <h1>Sign in</h1>
    <p class="subtitle">Welcome back to Acme Vault</p>
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
        <button type="submit" style="width:100%;justify-content:center;padding:10px">Continue</button>
      </div>
    </form>
    <div class="auth-footer">
      Don't have an account? <a href="/register">Create one</a>
    </div>`;
  res.send(renderShell({ title: 'Sign in', body, user: null, flash }));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    setFlash(req, 'error', 'Username and password are required.');
    return res.redirect('/login');
  }
  const user = db.getUser(username);
  if (!user || user.password !== password) {
    setFlash(req, 'error', 'Invalid credentials.');
    return res.redirect('/login');
  }
  req.session.username = username;
  res.redirect('/');
});

app.get('/register', (req, res) => {
  if (req.session.username) return res.redirect('/');
  const flash = res.locals.flash;
  const body = `
    <h1>Create your account</h1>
    <p class="subtitle">Get started with Acme Vault — free for personal use</p>
    <form method="POST" action="/register">
      <div class="form-row">
        <label for="username">Username</label>
        <input id="username" name="username" type="text" autocomplete="username" required>
        <span class="hint">3–20 characters: letters, digits, underscore.</span>
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
        <button type="submit" style="width:100%;justify-content:center;padding:10px">Create account</button>
      </div>
    </form>
    <div class="auth-footer">
      Already have an account? <a href="/login">Sign in</a>
    </div>`;
  res.send(renderShell({ title: 'Register', body, user: null, flash }));
});

app.post('/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    setFlash(req, 'error', 'All fields are required.');
    return res.redirect('/register');
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    setFlash(req, 'error', 'Username must be 3–20 characters: letters, digits, underscore only.');
    return res.redirect('/register');
  }
  if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    setFlash(req, 'error', 'That username is reserved.');
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
    setFlash(req, 'error', 'Registration failed.');
    return res.redirect('/register');
  }
  req.session.username = username;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ============================================================
// Authenticated pages
// ============================================================
app.get('/', requireAuth, (req, res) => {
  const user = db.getUser(req.session.username);
  const flash = res.locals.flash;
  const scopes = user.scopes.split(',').map(s => s.trim()).filter(Boolean);
  const body = `
    <div class="page-header">
      <h1>Welcome back, ${escapeHtml(user.username)}</h1>
      <p>Manage your API keys, monitor usage, and access the Vault API.</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">Plan</div>
        <div class="value">Developer</div>
        <div class="delta">Free tier</div>
      </div>
      <div class="stat-card">
        <div class="label">Active API keys</div>
        <div class="value">1</div>
      </div>
      <div class="stat-card">
        <div class="label">Granted scopes</div>
        <div class="value">${scopes.length}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2>Quick start</h2>
          <div class="subtitle">Three steps to integrate with Acme Vault</div>
        </div>
      </div>
      <div class="card-body">
        <ol style="margin: 0; padding-left: 20px; line-height: 1.9;">
          <li>Copy your API key from the <a href="/keys">API Keys</a> page.</li>
          <li>Browse available endpoints in the <a href="/docs">API Reference</a>.</li>
          <li>Test endpoints directly from the docs or with curl.</li>
        </ol>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2>Latest changelog</h2>
          <div class="subtitle">Platform updates</div>
        </div>
        <span class="badge badge-info">v1.4.2</span>
      </div>
      <div class="card-body">
        <p style="margin: 0 0 10px;"><strong>April 2026 — Credential rotation</strong></p>
        <p class="muted text-sm" style="margin: 0 0 12px">
          Service credentials are now rotated automatically every 15 seconds.
          Customer-facing API keys are unaffected.
        </p>
        <p style="margin: 0 0 10px;"><strong>March 2026 — Realtime feeds</strong></p>
        <p class="muted text-sm" style="margin: 0 0 12px">
          Public price feed available at <code>ws://&lt;host&gt;/ws/public</code>.
          Internal monitoring feed at <code>ws://&lt;host&gt;/ws/system</code>
          exposes <code>system.health</code> and <code>system.metrics</code>
          channels for ops dashboards.Other internal subsystems publish events using the same channel naming convention.
        </p>
      </div>
    </div>
  `;
  res.send(renderShell({ title: 'Dashboard', body, user, flash, activeNav: 'dashboard' }));
});

app.get('/keys', requireAuth, (req, res) => {
  const user = db.getUser(req.session.username);
  const flash = res.locals.flash;
  const scopes = user.scopes.split(',').map(s => s.trim()).filter(Boolean);
  const body = `
    <div class="page-header">
      <h1>API Keys</h1>
      <p>Use these keys to authenticate requests to the Vault API.</p>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2>Personal key</h2>
          <div class="subtitle">For accessing endpoints your account is scoped for</div>
        </div>
        <span class="badge badge-success">Active</span>
      </div>
      <div class="card-body">
        <div class="form-row">
          <label>Key</label>
          <div class="key-reveal">
            <span class="key">${escapeHtml(user.api_key)}</span>
            <button class="copy-btn" onclick="navigator.clipboard.writeText('${escapeHtml(user.api_key)}'); this.textContent='Copied'; setTimeout(()=>this.textContent='Copy',1500)">Copy</button>
          </div>
          <span class="hint">Pass this in the <code>X-API-Key</code> header.</span>
        </div>
        <div class="form-row" style="margin-bottom:0">
          <label>Granted scopes</label>
          <div>${scopes.map(s => `<span class="scope-pill">${escapeHtml(s)}</span>`).join('')}</div>
          <span class="hint">Endpoints requiring scopes outside this list will return <code>403</code>.</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2>Try it out</h2>
          <div class="subtitle">Quick example using your key</div>
        </div>
      </div>
      <div class="card-body">
        <pre><code>curl -H "X-API-Key: ${escapeHtml(user.api_key)}" \\
     http://&lt;host&gt;/api/v1/account</code></pre>
      </div>
    </div>
  `;
  res.send(renderShell({ title: 'API Keys', body, user, flash, activeNav: 'keys' }));
});

app.get('/markets', requireAuth, (req, res) => {
  const user = db.getUser(req.session.username);
  const flash = res.locals.flash;
  const body = `
    <div class="page-header">
      <h1>Live Markets</h1>
      <p>Real-time price feed for tracked assets. Streams via WebSocket from <code>/ws/public</code>.</p>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2>Tracked symbols</h2>
          <div class="subtitle">Updates every 2 seconds while connected</div>
        </div>
        <span id="conn-status" class="conn-pill offline">
          <span class="dot"></span>
          <span>Connecting…</span>
        </span>
      </div>
      <div class="card-body">
        <div id="market-grid" class="market-grid">
          <!-- Populated by JS once first message arrives -->
          <div class="empty-state">
            <div class="icon">○</div>
            <p>Waiting for first price update…</p>
          </div>
        </div>
        <div class="last-update" id="last-update"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2>How this works</h2>
          <div class="subtitle">For developers integrating live data</div>
        </div>
      </div>
      <div class="card-body">
        <p>This page opens a WebSocket connection to <code>/ws/public</code> on page load. The server pushes a <code>price_update</code> message every 2 seconds containing all tracked symbols.</p>
        <pre><code>// Sample client code
const ws = new WebSocket('ws://&lt;host&gt;/ws/public');
ws.onmessage = (e) =&gt; {
  const msg = JSON.parse(e.data);
  if (msg.type === 'price_update') {
    console.log(msg.prices); // { AVK: 12.34, BTC: ..., ETH: ..., XAU: ... }
  }
};</code></pre>
      </div>
    </div>

    <script>
    (function() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = proto + '//' + location.host + '/ws/public';

      const grid = document.getElementById('market-grid');
      const status = document.getElementById('conn-status');
      const lastUpdate = document.getElementById('last-update');

      // Track previous prices to compute delta + flash direction
      const lastPrices = {};
      const cards = {};

      function setStatus(state, text) {
        status.className = 'conn-pill ' + state;
        status.innerHTML = '<span class="dot"></span><span>' + text + '</span>';
      }

      function fmtPrice(v) {
        if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
        return v.toFixed(2);
      }

      function ensureCard(symbol) {
        if (cards[symbol]) return cards[symbol];
        // Clear empty-state if first card
        if (Object.keys(cards).length === 0) grid.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'market-card';
        card.innerHTML =
          '<div class="symbol">' + symbol + '</div>' +
          '<div class="price"><span class="currency">$</span><span class="price-value">--</span></div>' +
          '<div class="change neutral">—</div>';
        grid.appendChild(card);
        cards[symbol] = {
          el: card,
          priceEl: card.querySelector('.price-value'),
          changeEl: card.querySelector('.change')
        };
        return cards[symbol];
      }

      function updateCard(symbol, price) {
        const c = ensureCard(symbol);
        const prev = lastPrices[symbol];
        c.priceEl.textContent = fmtPrice(price);

        if (prev !== undefined && prev !== price) {
          const delta = price - prev;
          const pct = (delta / prev) * 100;
          const sign = delta > 0 ? '+' : '';
          c.changeEl.textContent = sign + delta.toFixed(2) + ' (' + sign + pct.toFixed(2) + '%)';
          c.changeEl.className = 'change ' + (delta > 0 ? 'up' : 'down');

          // Flash border
          c.el.classList.remove('flash-up', 'flash-down');
          void c.el.offsetWidth; // restart animation
          c.el.classList.add(delta > 0 ? 'flash-up' : 'flash-down');
        }

        lastPrices[symbol] = price;
      }

      let ws;
      let reconnectTimer = null;

      function connect() {
        setStatus('offline', 'Connecting…');
        ws = new WebSocket(url);

        ws.addEventListener('open', () => setStatus('live', 'Live'));

        ws.addEventListener('message', (ev) => {
          let msg;
          try { msg = JSON.parse(ev.data); } catch (e) { return; }
          if (msg.type === 'price_update' && msg.prices) {
            for (const [sym, price] of Object.entries(msg.prices)) {
              updateCard(sym, price);
            }
            const t = new Date(msg.timestamp || Date.now());
            lastUpdate.textContent = 'Last update: ' + t.toLocaleTimeString();
          }
        });

        ws.addEventListener('close', () => {
          setStatus('offline', 'Disconnected — retrying…');
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 2000);
        });

        ws.addEventListener('error', () => {
          // close handler will retry
        });
      }

      connect();

      window.addEventListener('beforeunload', () => {
        if (ws) ws.close();
      });
    })();
    </script>
  `;
  res.send(renderShell({ title: 'Live Markets', body, user, flash, activeNav: 'markets' }));
});

app.get('/account', requireAuth, (req, res) => {
  const user = db.getUser(req.session.username);
  const flash = res.locals.flash;
  const scopes = user.scopes.split(',').map(s => s.trim()).filter(Boolean);
  const body = `
    <div class="page-header">
      <h1>Account</h1>
      <p>Your profile and preferences.</p>
    </div>
    <div class="card">
      <div class="card-header">
        <div><h2>Profile</h2></div>
      </div>
      <div class="card-body">
        <dl class="field-grid">
          <dt>Username</dt><dd>${escapeHtml(user.username)}</dd>
          <dt>Email</dt><dd>${escapeHtml(user.email)}</dd>
          <dt>Member since</dt><dd>${escapeHtml(user.created_at)}</dd>
          <dt>API key</dt><dd><code>${escapeHtml(user.api_key)}</code></dd>
          <dt>Scopes</dt><dd>${scopes.map(s => `<span class="scope-pill">${escapeHtml(s)}</span>`).join('')}</dd>
        </dl>
      </div>
    </div>
  `;
  res.send(renderShell({ title: 'Account', body, user, flash, activeNav: 'account' }));
});

// ============================================================
// API Reference (Swagger UI)
//
// We mount swagger-ui at /docs.  Note: swagger-ui-express
// does its own response writing; we don't wrap it in our shell.
// ============================================================
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: 'Acme Vault — API Reference',
  customCss: `
    .topbar { display: none; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  `,
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'list'
  }
}));

// Convenience redirect
app.get('/api/docs', (req, res) => res.redirect('/docs'));

// ============================================================
// REST API endpoints
// ============================================================
function getApiKeyFromRequest(req) {
  return req.headers['x-api-key'] || req.query.api_key;
}

app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.4.2',
    uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000)
  });
});

app.get('/api/v1/account', (req, res) => {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'missing API key', required_scope: 'account:read' });
  }
  const user = db.getUserByApiKey(apiKey);
  if (!user) {
    return res.status(401).json({ error: 'invalid API key' });
  }
  const scopes = user.scopes.split(',').map(s => s.trim()).filter(Boolean);
  if (!scopes.includes('account:read')) {
    return res.status(403).json({ error: 'insufficient scope', required_scope: 'account:read' });
  }
  res.json({
    username: user.username,
    email: user.email,
    scopes,
    created_at: user.created_at
  });
});

app.get('/api/v1/flag', (req, res) => {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'missing API key', required_scope: 'flag:read' });
  }

  // First try service rotation keys (the intended path)
  const svc = rotation.validateServiceKey(apiKey, 'flag:read');
  if (svc.valid) {
    return res.json({
      flag: FLAG,
      retrieved_at: new Date().toISOString()
    });
  }

  // Fall back to user keys (will fail scope check — flag:read isn't granted to users)
  const user = db.getUserByApiKey(apiKey);
  if (!user) {
    return res.status(401).json({ error: 'invalid API key' });
  }
  return res.status(403).json({
    error: 'insufficient scope',
    required_scope: 'flag:read',
    granted_scopes: user.scopes.split(',').map(s => s.trim()).filter(Boolean)
  });
});

// ============================================================
// 404
// ============================================================
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not found' });
  }
  const user = req.session.username ? db.getUser(req.session.username) : null;
  const body = `
    <div class="page-header">
      <h1>404 — Not found</h1>
      <p>The page <code>${escapeHtml(req.path)}</code> doesn't exist.</p>
    </div>
    <div class="card"><div class="card-body"><a href="/">← Back to dashboard</a></div></div>
  `;
  if (user) {
    res.status(404).send(renderShell({ title: 'Not found', body, user, flash: null, activeNav: null }));
  } else {
    res.status(404).redirect('/login');
  }
});

// ============================================================
// WebSocket servers
//
// Two endpoints:
//   /ws/public — broadcasts public price ticker (red herring,
//                shows the player WS works and looks normal)
//   /ws/system — internal channel; subscribing to "system.audit"
//                yields rotation events (the intended path)
//
// /ws/system isn't documented anywhere obvious. The hint is:
//  - dashboard mentions "credential rotation every 15 seconds"
//  - changelog mentions credential rotation
//  - the changelog/news suggests there's an internal audit feed
//
// (The README hint trail makes this fair for blackbox solving.)
// ============================================================
const wssPublic = new WebSocketServer({ noServer: true });
const wssSystem = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = req.url;
  if (url === '/ws/public' || url.startsWith('/ws/public?')) {
    wssPublic.handleUpgrade(req, socket, head, ws => {
      wssPublic.emit('connection', ws, req);
    });
  } else if (url === '/ws/system' || url.startsWith('/ws/system?')) {
    wssSystem.handleUpgrade(req, socket, head, ws => {
      wssSystem.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ----- Public WS: simulated price ticker (red herring) -----
const TICKER_SYMBOLS = ['AVK', 'BTC', 'ETH', 'XAU'];
let priceState = {
  AVK: 12.34, BTC: 67500.0, ETH: 3200.0, XAU: 2350.0
};

function tickPrices() {
  for (const sym of TICKER_SYMBOLS) {
    const drift = (Math.random() - 0.5) * 0.02;
    priceState[sym] = +(priceState[sym] * (1 + drift)).toFixed(2);
  }
}

setInterval(() => {
  tickPrices();
  const update = {
    type: 'price_update',
    timestamp: new Date().toISOString(),
    prices: { ...priceState }
  };
  for (const client of wssPublic.clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(update));
    }
  }
}, 2000);

wssPublic.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'welcome',
    channel: 'public.prices',
    message: 'Connected to public price feed',
    available_symbols: TICKER_SYMBOLS
  }));
  // Push current snapshot immediately so subscribers don't wait
  ws.send(JSON.stringify({
    type: 'price_update',
    timestamp: new Date().toISOString(),
    prices: { ...priceState }
  }));
});

// ----- System WS: subscribe-based, audit channel has rotation events -----
const KNOWN_CHANNELS = new Set(['system.health', 'system.audit', 'system.metrics']);
const ADVERTISED_CHANNELS = ['system.health', 'system.metrics']; // audit not advertised

wssSystem.on('connection', (ws) => {
  ws.subscriptions = new Set();

  ws.send(JSON.stringify({
    type: 'welcome',
    server: 'acme-vault-internal',
    instructions: 'Send {"action":"subscribe","channel":"<name>"} to subscribe.',
    advertised_channels: ADVERTISED_CHANNELS
  }));

  // Heartbeat for system.health subscribers
  const hbInterval = setInterval(() => {
    if (ws.readyState !== 1) return;
    if (ws.subscriptions.has('system.health')) {
      ws.send(JSON.stringify({
        type: 'heartbeat',
        channel: 'system.health',
        timestamp: new Date().toISOString(),
        status: 'ok'
      }));
    }
    if (ws.subscriptions.has('system.metrics')) {
      ws.send(JSON.stringify({
        type: 'metrics',
        channel: 'system.metrics',
        timestamp: new Date().toISOString(),
        cpu_percent: +(Math.random() * 30 + 10).toFixed(1),
        mem_percent: +(Math.random() * 40 + 30).toFixed(1)
      }));
    }
  }, 5000);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', error: 'invalid JSON' }));
      return;
    }

    if (msg.action === 'subscribe' && typeof msg.channel === 'string') {
      const ch = msg.channel;
      if (!KNOWN_CHANNELS.has(ch)) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `unknown channel: ${ch}`,
          known: ADVERTISED_CHANNELS
        }));
        return;
      }
      ws.subscriptions.add(ch);
      ws.send(JSON.stringify({
        type: 'subscribed',
        channel: ch
      }));

      // Replay last events on subscribe to system.audit
      if (ch === 'system.audit') {
        for (const ev of rotation.getHistory()) {
          ws.send(JSON.stringify({ ...ev, channel: 'system.audit' }));
        }
      }
      return;
    }

    if (msg.action === 'unsubscribe' && typeof msg.channel === 'string') {
      ws.subscriptions.delete(msg.channel);
      ws.send(JSON.stringify({ type: 'unsubscribed', channel: msg.channel }));
      return;
    }

    ws.send(JSON.stringify({
      type: 'error',
      error: 'unknown action; expected subscribe / unsubscribe'
    }));
  });

  ws.on('close', () => clearInterval(hbInterval));
});

// Forward rotation events to all system.audit subscribers
rotation.on('rotation', (event) => {
  const payload = JSON.stringify({ ...event, channel: 'system.audit' });
  for (const client of wssSystem.clients) {
    if (client.readyState === 1 && client.subscriptions && client.subscriptions.has('system.audit')) {
      client.send(payload);
    }
  }
});

// ============================================================
// Start
// ============================================================
rotation.start();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`VaultKey backend listening on port ${PORT}`);
  console.log(`DB: ${process.env.DB_PATH || '/data/vault.db'}`);
  console.log(`Flag loaded: ${FLAG.length > 0}`);
});
