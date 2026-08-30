// ============================================================
// Tahuna API routes
// ============================================================
module.exports = function (app, { db, jwt }) {

  const bearer = jwt.bearerAuth(db);

  function publicUser(u) {
    if (!u) return null;
    const { password, ...rest } = u;
    return rest;
  }

  // ============================================================
  // Me
  // ============================================================
  app.get('/api/me', bearer, (req, res) => {
    res.json({ user: publicUser(req.user), token: { sub: req.tokenClaims.sub, role: req.tokenClaims.role, iat: req.tokenClaims.iat, exp: req.tokenClaims.exp } });
  });

  // ============================================================
  // Portfolios
  // ============================================================
  app.get('/api/portfolios', bearer, (req, res) => {
    const list = db.getPortfoliosByUser(req.user.id);
    const enriched = list.map(p => {
      const holdings = db.getHoldingsByPort(p.id);
      const total = holdings.reduce((acc, h) => acc + (h.units * h.last_price), 0);
      const cost  = holdings.reduce((acc, h) => acc + (h.units * h.avg_cost), 0);
      return {
        id: p.id, name: p.name, risk_profile: p.risk_profile,
        base_currency: p.base_currency, created_at: p.created_at,
        total_value: Math.round(total),
        unrealized_pnl: Math.round(total - cost),
        holdings_count: holdings.length
      };
    });
    res.json({ portfolios: enriched });
  });

  app.get('/api/portfolios/:id', bearer, (req, res) => {
    const p = db.getPortfolioById(parseInt(req.params.id, 10));
    if (!p) return res.status(404).json({ error: 'portfolio not found' });
    if (p.user_id !== req.user.id) {
      return res.status(403).json({ error: 'portfolio does not belong to current user' });
    }
    const holdings = db.getHoldingsByPort(p.id);
    res.json({
      portfolio: {
        id: p.id, name: p.name, risk_profile: p.risk_profile,
        base_currency: p.base_currency, created_at: p.created_at
      },
      holdings: holdings.map(h => ({
        asset_class: h.asset_class, symbol: h.symbol, name: h.name,
        units: h.units, avg_cost: h.avg_cost, last_price: h.last_price,
        market_value: Math.round(h.units * h.last_price),
        cost_basis:   Math.round(h.units * h.avg_cost),
        unrealized_pnl: Math.round((h.last_price - h.avg_cost) * h.units),
        currency: h.currency
      }))
    });
  });

  app.get('/api/portfolios/:id/transactions', bearer, (req, res) => {
    const p = db.getPortfolioById(parseInt(req.params.id, 10));
    if (!p) return res.status(404).json({ error: 'portfolio not found' });
    if (p.user_id !== req.user.id) {
      return res.status(403).json({ error: 'portfolio does not belong to current user' });
    }
    const lim = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const txs = db.getTransactionsByPort(p.id, lim);
    res.json({ transactions: txs });
  });

  // ============================================================
  // Watchlist
  // ============================================================
  app.get('/api/watchlist', bearer, (req, res) => {
    res.json({ watchlist: db.getWatchlistByUser(req.user.id) });
  });

  app.post('/api/watchlist', bearer, (req, res) => {
    const symbol = String((req.body && req.body.symbol) || '').toUpperCase().trim();
    const name = String((req.body && req.body.name) || '').trim() || symbol;
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
      return res.status(400).json({ error: 'symbol harus 2-10 karakter alphanumeric uppercase' });
    }
    db.addWatchlist(req.user.id, symbol, name);
    res.json({ ok: true });
  });

  app.delete('/api/watchlist/:symbol', bearer, (req, res) => {
    db.removeWatchlist(req.user.id, req.params.symbol.toUpperCase());
    res.json({ ok: true });
  });

  // ============================================================
  // Market notes
  // ============================================================
  app.get('/api/market/notes', bearer, (req, res) => {
    const lim = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    res.json({ notes: db.getMarketNotes(lim) });
  });

  // ============================================================
  // Admin-only endpoints
  // ============================================================
  function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'admin role required' });
    }
    next();
  }

  app.get('/api/admin/users', bearer, requireAdmin, (req, res) => {
    res.json({ users: db.getAllUsers(), total: db.countUsers() });
  });

  app.get('/api/admin/treasury/secrets', bearer, requireAdmin, (req, res) => {
    res.json({
      _comment: 'Treasury runtime secrets — for ops dashboard only',
      runtime_id: 'tahuna-prod-treasury-mx9',
      payment_gateway: {
        provider: 'midtrans',
        merchant_id: 'M-2026-SI-091245',
        webhook_secret: 'wh_sk_live_8a3f9d2e1c7b4f6a'
      },
      mailer: 'smtps://mailer.internal.tahuna.id:465',
      sentry_dsn: 'https://[email protected]/tahuna-prod',
      treasury_signature_key: db.FLAG
    });
  });
};
