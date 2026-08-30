// ============================================================
// Tahuna SPA — portfolio dashboard
// ============================================================
(function () {
  'use strict';

  const TOKEN_KEY = 'tahuna_token';
  let me = null;

  function token() { return localStorage.getItem(TOKEN_KEY); }
  function logout() { localStorage.removeItem(TOKEN_KEY); location.href = '/login'; }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }
  function el(id) { return document.getElementById(id); }

  async function api(method, path, body) {
    const t = token();
    if (!t) { logout(); return; }
    const opts = {
      method,
      headers: {
        'Authorization': 'Bearer ' + t,
        'Accept': 'application/json'
      }
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401) { logout(); return { ok: false, status: 401, data }; }
    return { ok: res.ok, status: res.status, data };
  }

  function fmtIDR(n) {
    if (n === null || n === undefined) return '—';
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  }
  function fmtNum(n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 4 });
  }
  function fmtDate(s) {
    if (!s) return '—';
    return s.slice(0, 10);
  }
  function pnlClass(n) {
    if (n > 0) return 'pnl-pos';
    if (n < 0) return 'pnl-neg';
    return 'pnl-flat';
  }
  function pnlSign(n) {
    if (n > 0) return '+';
    return '';
  }

  // ============================================================
  // Shell
  // ============================================================
  function buildShell() {
    el('app-root').innerHTML = `
      <header class="topbar">
        <a class="brand" href="#dashboard">
          <div class="brand-mark"><span>T</span></div>
          <div class="brand-text">tahuna<em>.invest</em></div>
        </a>
        <div class="topbar-spacer"></div>
        <nav class="topnav">
          <a href="#dashboard" data-view="dashboard" class="topnav-link active">Dashboard</a>
          <a href="#portfolios" data-view="portfolios" class="topnav-link">Portofolio</a>
          <a href="#watchlist" data-view="watchlist" class="topnav-link">Watchlist</a>
          <a href="#market" data-view="market" class="topnav-link">Market</a>
        </nav>
        <div class="topbar-user">
          <span class="user-name">${esc(me.full_name || me.username)}</span>
          <span class="user-role">${esc(me.role)}</span>
          <a class="btn-logout" href="/logout">Logout</a>
        </div>
      </header>
      <main class="layout">
        <section id="view-dashboard" class="view active"></section>
        <section id="view-portfolios" class="view"></section>
        <section id="view-portfolio-detail" class="view"></section>
        <section id="view-watchlist" class="view"></section>
        <section id="view-market" class="view"></section>
      </main>
    `;
    document.querySelectorAll('.topnav-link').forEach(a => {
      a.addEventListener('click', ev => {
        ev.preventDefault();
        const v = a.dataset.view;
        location.hash = '#' + v;
        switchView(v);
      });
    });
    window.addEventListener('hashchange', () => {
      const h = location.hash.replace(/^#/, '') || 'dashboard';
      const m = h.match(/^portfolio\/(\d+)$/);
      if (m) {
        renderPortfolioDetail(m[1]);
      } else {
        switchView(h);
      }
    });
  }

  function switchView(name) {
    document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.topnav-link').forEach(a => a.classList.toggle('active', a.dataset.view === name));

    if (name === 'dashboard') { el('view-dashboard').classList.add('active'); renderDashboard(); }
    else if (name === 'portfolios') { el('view-portfolios').classList.add('active'); renderPortfolioList(); }
    else if (name === 'watchlist') { el('view-watchlist').classList.add('active'); renderWatchlist(); }
    else if (name === 'market') { el('view-market').classList.add('active'); renderMarket(); }
    else { el('view-dashboard').classList.add('active'); renderDashboard(); }
  }

  // ============================================================
  // Dashboard
  // ============================================================
  async function renderDashboard() {
    const root = el('view-dashboard');
    root.innerHTML = '<div class="loading">Memuat dashboard…</div>';

    const [pr, mr] = await Promise.all([api('GET', '/api/portfolios'), api('GET', '/api/market/notes?limit=4')]);
    const portfolios = (pr.data && pr.data.portfolios) || [];
    const notes = (mr.data && mr.data.notes) || [];

    const totalValue = portfolios.reduce((acc, p) => acc + p.total_value, 0);
    const totalPnL   = portfolios.reduce((acc, p) => acc + p.unrealized_pnl, 0);
    const pnlPct = totalValue > 0 ? ((totalPnL / (totalValue - totalPnL)) * 100) : 0;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">Halo, ${esc(me.full_name || me.username)}</h1>
          <p class="page-sub">Ringkasan portofolio dan update pasar terbaru.</p>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Total Aset</div>
          <div class="stat-value">${fmtIDR(totalValue)}</div>
          <div class="stat-foot">${portfolios.length} portofolio aktif</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Unrealized P&amp;L</div>
          <div class="stat-value ${pnlClass(totalPnL)}">${pnlSign(totalPnL)}${fmtIDR(totalPnL)}</div>
          <div class="stat-foot ${pnlClass(totalPnL)}">${pnlSign(pnlPct)}${pnlPct.toFixed(2)}% all-time</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Risk Profile</div>
          <div class="stat-value" style="font-size:18px">${portfolios.length > 0 ? esc(portfolios[0].risk_profile) : '—'}</div>
          <div class="stat-foot">Berdasarkan portofolio utama</div>
        </div>
      </div>

      <h2 class="section-title">Portofolio Saya</h2>
      <div class="portfolio-list">
        ${portfolios.length === 0 ? '<div class="empty">Belum ada portofolio. <a href="#portfolios">Buat portofolio</a> untuk mulai investasi.</div>' :
          portfolios.map(p => `
            <a class="portfolio-card" href="#portfolio/${p.id}">
              <div class="portfolio-head">
                <div class="portfolio-name">${esc(p.name)}</div>
                <span class="risk-pill risk-${esc(p.risk_profile)}">${esc(p.risk_profile)}</span>
              </div>
              <div class="portfolio-stats">
                <div><span class="muted">Nilai</span><strong>${fmtIDR(p.total_value)}</strong></div>
                <div><span class="muted">P&amp;L</span><strong class="${pnlClass(p.unrealized_pnl)}">${pnlSign(p.unrealized_pnl)}${fmtIDR(p.unrealized_pnl)}</strong></div>
                <div><span class="muted">Holdings</span><strong>${p.holdings_count}</strong></div>
              </div>
            </a>
          `).join('')}
      </div>

      <h2 class="section-title">Market Notes Terbaru</h2>
      <div class="notes-grid">
        ${notes.map(n => `
          <article class="note-card">
            <div class="note-cat">${esc(n.category)}</div>
            <h3>${esc(n.title)}</h3>
            <p class="note-body">${esc((n.body || '').slice(0, 200))}…</p>
            <div class="note-foot">${esc(n.author)} · ${esc(fmtDate(n.published_at))}</div>
          </article>
        `).join('')}
      </div>
    `;
  }

  // ============================================================
  // Portfolio list
  // ============================================================
  async function renderPortfolioList() {
    const root = el('view-portfolios');
    root.innerHTML = '<div class="loading">Memuat…</div>';
    const r = await api('GET', '/api/portfolios');
    const portfolios = (r.data && r.data.portfolios) || [];

    root.innerHTML = `
      <h1 class="page-title">Portofolio Saya</h1>
      <p class="page-sub">${portfolios.length} portofolio aktif</p>

      <div class="portfolio-list">
        ${portfolios.length === 0 ? '<div class="empty">Belum ada portofolio.</div>' :
          portfolios.map(p => `
            <a class="portfolio-card" href="#portfolio/${p.id}">
              <div class="portfolio-head">
                <div class="portfolio-name">${esc(p.name)}</div>
                <span class="risk-pill risk-${esc(p.risk_profile)}">${esc(p.risk_profile)}</span>
              </div>
              <div class="portfolio-stats">
                <div><span class="muted">Nilai</span><strong>${fmtIDR(p.total_value)}</strong></div>
                <div><span class="muted">P&amp;L</span><strong class="${pnlClass(p.unrealized_pnl)}">${pnlSign(p.unrealized_pnl)}${fmtIDR(p.unrealized_pnl)}</strong></div>
                <div><span class="muted">Holdings</span><strong>${p.holdings_count}</strong></div>
              </div>
            </a>
          `).join('')}
      </div>
    `;
  }

  async function renderPortfolioDetail(id) {
    document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
    const root = el('view-portfolio-detail');
    root.classList.add('active');
    root.innerHTML = '<div class="loading">Memuat detail…</div>';

    const [pr, tr] = await Promise.all([
      api('GET', '/api/portfolios/' + id),
      api('GET', '/api/portfolios/' + id + '/transactions?limit=10')
    ]);

    if (!pr.ok) { root.innerHTML = '<div class="alert alert-error">Gagal memuat portofolio.</div>'; return; }
    const p = pr.data.portfolio;
    const holdings = pr.data.holdings || [];
    const txs = (tr.data && tr.data.transactions) || [];

    const total = holdings.reduce((acc, h) => acc + h.market_value, 0);
    const cost = holdings.reduce((acc, h) => acc + h.cost_basis, 0);
    const pnl = total - cost;

    root.innerHTML = `
      <div class="breadcrumb"><a href="#portfolios">Portofolio</a> / ${esc(p.name)}</div>
      <div class="page-head">
        <div>
          <h1 class="page-title">${esc(p.name)}</h1>
          <p class="page-sub">Risk: <span class="risk-pill risk-${esc(p.risk_profile)}">${esc(p.risk_profile)}</span> · Currency: ${esc(p.base_currency)}</p>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Nilai</div><div class="stat-value">${fmtIDR(total)}</div></div>
        <div class="stat-card"><div class="stat-label">Cost Basis</div><div class="stat-value">${fmtIDR(cost)}</div></div>
        <div class="stat-card"><div class="stat-label">P&amp;L</div><div class="stat-value ${pnlClass(pnl)}">${pnlSign(pnl)}${fmtIDR(pnl)}</div></div>
      </div>

      <h2 class="section-title">Holdings</h2>
      ${holdings.length === 0 ? '<div class="empty">Belum ada holding.</div>' : `
        <table class="data-table">
          <thead><tr>
            <th>Symbol</th><th>Name</th><th>Class</th>
            <th class="ta-right">Units</th><th class="ta-right">Avg Cost</th>
            <th class="ta-right">Last</th><th class="ta-right">Value</th><th class="ta-right">P&amp;L</th>
          </tr></thead>
          <tbody>
            ${holdings.map(h => `
              <tr>
                <td><strong>${esc(h.symbol)}</strong></td>
                <td>${esc(h.name)}</td>
                <td><span class="class-pill">${esc(h.asset_class)}</span></td>
                <td class="ta-right">${fmtNum(h.units)}</td>
                <td class="ta-right">${fmtIDR(h.avg_cost)}</td>
                <td class="ta-right">${fmtIDR(h.last_price)}</td>
                <td class="ta-right"><strong>${fmtIDR(h.market_value)}</strong></td>
                <td class="ta-right ${pnlClass(h.unrealized_pnl)}">${pnlSign(h.unrealized_pnl)}${fmtIDR(h.unrealized_pnl)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}

      <h2 class="section-title">Transaksi Terbaru</h2>
      ${txs.length === 0 ? '<div class="empty">Belum ada transaksi.</div>' : `
        <table class="data-table">
          <thead><tr><th>Tanggal</th><th>Tipe</th><th>Symbol</th><th class="ta-right">Units</th><th class="ta-right">Price</th><th class="ta-right">Amount</th><th>Note</th></tr></thead>
          <tbody>
            ${txs.map(t => `
              <tr>
                <td>${esc(fmtDate(t.executed_at))}</td>
                <td><span class="tx-pill tx-${esc(t.type)}">${esc(t.type)}</span></td>
                <td>${esc(t.symbol || '—')}</td>
                <td class="ta-right">${t.units ? fmtNum(t.units) : '—'}</td>
                <td class="ta-right">${t.price ? fmtIDR(t.price) : '—'}</td>
                <td class="ta-right"><strong>${fmtIDR(t.amount)}</strong></td>
                <td>${esc(t.note || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    `;
  }

  // ============================================================
  // Watchlist
  // ============================================================
  async function renderWatchlist() {
    const root = el('view-watchlist');
    root.innerHTML = '<div class="loading">Memuat…</div>';
    const r = await api('GET', '/api/watchlist');
    const items = (r.data && r.data.watchlist) || [];

    root.innerHTML = `
      <h1 class="page-title">Watchlist</h1>
      <p class="page-sub">Daftar simbol yang Anda pantau</p>
      <form id="watch-form" class="watch-form">
        <input name="symbol" placeholder="Symbol (cth: BBCA)" required pattern="[A-Z0-9]{2,10}">
        <input name="name" placeholder="Nama (opsional)">
        <button class="btn-primary" type="submit">Tambah</button>
      </form>

      <div class="watch-list">
        ${items.length === 0 ? '<div class="empty">Belum ada simbol di watchlist.</div>' :
          items.map(w => `
            <div class="watch-card">
              <div><strong>${esc(w.symbol)}</strong> · <span class="muted">${esc(w.name || '—')}</span></div>
              <button class="btn-ghost btn-sm" data-rm="${esc(w.symbol)}">Hapus</button>
            </div>
          `).join('')}
      </div>
    `;
    el('watch-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const r = await api('POST', '/api/watchlist', { symbol: fd.get('symbol'), name: fd.get('name') });
      if (r.ok) renderWatchlist();
      else alert((r.data && r.data.error) || 'Gagal menambah');
    });
    document.querySelectorAll('[data-rm]').forEach(b => {
      b.addEventListener('click', async () => {
        await api('DELETE', '/api/watchlist/' + b.dataset.rm);
        renderWatchlist();
      });
    });
  }

  // ============================================================
  // Market notes
  // ============================================================
  async function renderMarket() {
    const root = el('view-market');
    root.innerHTML = '<div class="loading">Memuat…</div>';
    const r = await api('GET', '/api/market/notes?limit=20');
    const notes = (r.data && r.data.notes) || [];

    root.innerHTML = `
      <h1 class="page-title">Market Notes</h1>
      <p class="page-sub">Research notes dan market brief dari tim riset.</p>
      <div class="notes-grid">
        ${notes.map(n => `
          <article class="note-card">
            <div class="note-cat">${esc(n.category)}</div>
            <h3>${esc(n.title)}</h3>
            <p class="note-body">${esc(n.body)}</p>
            <div class="note-foot">${esc(n.author)} · ${esc(fmtDate(n.published_at))}</div>
          </article>
        `).join('') || '<div class="empty">Belum ada notes.</div>'}
      </div>
    `;
  }

  // ============================================================
  // Init
  // ============================================================
  async function init() {
    if (!token()) { location.href = '/login'; return; }
    const r = await api('GET', '/api/me');
    if (!r.ok) { logout(); return; }
    me = r.data.user;

    buildShell();
    const h = location.hash.replace(/^#/, '') || 'dashboard';
    const m = h.match(/^portfolio\/(\d+)$/);
    if (m) renderPortfolioDetail(m[1]);
    else switchView(h);
  }

  init();
})();
