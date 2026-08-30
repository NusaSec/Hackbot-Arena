// ============================================================
// Tahuna — wealth management dashboard database
// ============================================================
const Database = require('better-sqlite3');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || '/data/tahuna.db';
const FLAG = process.env.FLAG || 'FLAG{nusasec-not-set}';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    password     TEXT NOT NULL,
    full_name    TEXT NOT NULL,
    email        TEXT NOT NULL,
    role         TEXT DEFAULT 'client',
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolios (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    name         TEXT NOT NULL,
    risk_profile TEXT NOT NULL,
    base_currency TEXT DEFAULT 'IDR',
    created_at   TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS holdings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    asset_class  TEXT NOT NULL,
    symbol       TEXT NOT NULL,
    name         TEXT NOT NULL,
    units        REAL NOT NULL,
    avg_cost     REAL NOT NULL,
    last_price   REAL NOT NULL,
    currency     TEXT DEFAULT 'IDR',
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id  INTEGER NOT NULL,
    type          TEXT NOT NULL,
    symbol        TEXT,
    units         REAL,
    price         REAL,
    amount        REAL NOT NULL,
    note          TEXT,
    executed_at   TEXT NOT NULL,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
  );

  CREATE TABLE IF NOT EXISTS market_notes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    body         TEXT NOT NULL,
    author       TEXT NOT NULL,
    category     TEXT NOT NULL,
    published_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL,
    symbol    TEXT NOT NULL,
    name      TEXT NOT NULL,
    added_at  TEXT NOT NULL,
    UNIQUE(user_id, symbol)
  );
`);

// ============================================================
// Demo data — pre-seeded clients
// ============================================================
function hashPassword(p) {
  return crypto.createHash('sha256').update(p + '|tahuna-salt-v3').digest('hex');
}

const insUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password, full_name, email, role, created_at)
  VALUES (?, ?, ?, ?, ?, datetime('now', ?))
`);
const demoUsers = [
  ['demo_widya',  'Demo123!',   'Widya Sasmita',         '[email protected]',         'client',  '-180 days'],
  ['demo_andre',  'Demo123!',   'Andre Kurniawan',       '[email protected]',         'client',  '-160 days'],
  ['demo_putri',  'Demo123!',   'Putri Larasati',        '[email protected]',         'client',  '-120 days'],
  ['adm_satria',  'Adm9!xyzQ2',  'Satria Wibawa',         '[email protected]',         'admin',   '-365 days'],
];
for (const [u, p, n, e, r, d] of demoUsers) {
  insUser.run(u, hashPassword(p), n, e, r, d);
}

// Portfolios for the 3 demo clients
const insPort = db.prepare(`
  INSERT OR IGNORE INTO portfolios (user_id, name, risk_profile, base_currency, created_at)
  VALUES (?, ?, ?, ?, datetime('now', ?))
`);
const getUser = db.prepare('SELECT id FROM users WHERE username = ?');
const w = getUser.get('demo_widya'), a = getUser.get('demo_andre'), pu = getUser.get('demo_putri');
if (w) {
  insPort.run(w.id, 'Dana Pendidikan Anak', 'moderate', 'IDR', '-150 days');
  insPort.run(w.id, 'Dana Pensiun 25 Tahun', 'aggressive', 'IDR', '-120 days');
}
if (a) {
  insPort.run(a.id, 'Reksadana & Obligasi', 'conservative', 'IDR', '-140 days');
  insPort.run(a.id, 'Saham Lokal Aktif', 'aggressive', 'IDR', '-100 days');
}
if (pu) {
  insPort.run(pu.id, 'Dana Darurat & Likuid', 'conservative', 'IDR', '-110 days');
}

// Holdings — populate each portfolio with realistic assets
const insHold = db.prepare(`
  INSERT OR IGNORE INTO holdings (portfolio_id, asset_class, symbol, name, units, avg_cost, last_price, currency)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
function getPortfolio(userId, name) {
  return db.prepare('SELECT id FROM portfolios WHERE user_id = ? AND name = ?').get(userId, name);
}
function addHoldings(port, list) {
  if (!port) return;
  for (const h of list) insHold.run(port.id, h.cls, h.sym, h.name, h.units, h.avg, h.last, h.cur || 'IDR');
}
if (w) {
  addHoldings(getPortfolio(w.id, 'Dana Pendidikan Anak'), [
    { cls: 'mutual_fund', sym: 'STAR-PROTECT', name: 'Star Protected Income', units: 2500, avg: 1850, last: 1942, cur: 'IDR' },
    { cls: 'mutual_fund', sym: 'SCHRODER-DSB', name: 'Schroder Dana Stabil Bertumbuh', units: 1800, avg: 2120, last: 2245, cur: 'IDR' },
    { cls: 'bond',        sym: 'ORI024',       name: 'ORI Seri 024',                    units: 50,   avg: 1000000, last: 1018500, cur: 'IDR' }
  ]);
  addHoldings(getPortfolio(w.id, 'Dana Pensiun 25 Tahun'), [
    { cls: 'stock',       sym: 'BBCA',  name: 'Bank Central Asia',     units: 200,  avg: 8950,  last: 9425 },
    { cls: 'stock',       sym: 'TLKM',  name: 'Telkom Indonesia',      units: 1500, avg: 3340,  last: 3120 },
    { cls: 'stock',       sym: 'BBRI',  name: 'Bank Rakyat Indonesia', units: 800,  avg: 4720,  last: 4890 },
    { cls: 'etf',         sym: 'ASIA-X', name: 'ASEAN Equity Tracker', units: 35,   avg: 145000, last: 152400 }
  ]);
}
if (a) {
  addHoldings(getPortfolio(a.id, 'Reksadana & Obligasi'), [
    { cls: 'mutual_fund', sym: 'BNI-DPLK',   name: 'BNI Dana Lancar', units: 4200, avg: 1640, last: 1689 },
    { cls: 'bond',        sym: 'FR0091',      name: 'SBN FR0091',     units: 100,  avg: 990000, last: 1008000 },
    { cls: 'bond',        sym: 'SR018',       name: 'Sukuk Ritel 018', units: 80,   avg: 1000000, last: 1015750 }
  ]);
  addHoldings(getPortfolio(a.id, 'Saham Lokal Aktif'), [
    { cls: 'stock',       sym: 'GOTO',  name: 'GoTo Gojek Tokopedia', units: 8000, avg: 92,    last: 78 },
    { cls: 'stock',       sym: 'ANTM',  name: 'Aneka Tambang',        units: 350,  avg: 1820,  last: 2140 },
    { cls: 'stock',       sym: 'ASII',  name: 'Astra International',  units: 120,  avg: 5200,  last: 5350 },
    { cls: 'crypto',      sym: 'BTC',   name: 'Bitcoin',              units: 0.15, avg: 745000000, last: 1090000000 }
  ]);
}
if (pu) {
  addHoldings(getPortfolio(pu.id, 'Dana Darurat & Likuid'), [
    { cls: 'mutual_fund', sym: 'BAHANA-DML', name: 'Bahana Dana Likuid', units: 6500, avg: 1240, last: 1268 },
    { cls: 'deposit',     sym: 'DEP-3M',     name: 'Deposito 3 Bulan',   units: 1,    avg: 50000000, last: 50000000 }
  ]);
}

// Transactions — recent activity
const insTx = db.prepare(`
  INSERT OR IGNORE INTO transactions (portfolio_id, type, symbol, units, price, amount, note, executed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
`);
function addTxBatch(portId, txs) {
  if (!portId) return;
  for (const t of txs) insTx.run(portId, t.type, t.sym || null, t.units || null, t.price || null, t.amount, t.note || null, t.when);
}
if (w) {
  const p1 = getPortfolio(w.id, 'Dana Pendidikan Anak');
  const p2 = getPortfolio(w.id, 'Dana Pensiun 25 Tahun');
  if (p1) addTxBatch(p1.id, [
    { type: 'deposit', amount: 5000000, when: '-90 days', note: 'Top-up bulanan' },
    { type: 'buy', sym: 'STAR-PROTECT', units: 2500, price: 1850, amount: 4625000, when: '-88 days' },
    { type: 'deposit', amount: 5000000, when: '-30 days', note: 'Top-up bulanan' }
  ]);
  if (p2) addTxBatch(p2.id, [
    { type: 'buy', sym: 'BBCA', units: 100, price: 8950, amount: 895000, when: '-100 days' },
    { type: 'buy', sym: 'TLKM', units: 1000, price: 3340, amount: 3340000, when: '-95 days' },
    { type: 'sell', sym: 'BBCA', units: 50, price: 9100, amount: 455000, when: '-20 days', note: 'Profit taking sebagian' }
  ]);
}

// Watchlist
const insWatch = db.prepare(`INSERT OR IGNORE INTO watchlist (user_id, symbol, name, added_at) VALUES (?, ?, ?, datetime('now', ?))`);
if (w) {
  insWatch.run(w.id, 'BMRI', 'Bank Mandiri', '-40 days');
  insWatch.run(w.id, 'UNVR', 'Unilever Indonesia', '-30 days');
}
if (a) {
  insWatch.run(a.id, 'BREN', 'Barito Renewables', '-15 days');
  insWatch.run(a.id, 'AMMN', 'Amman Mineral', '-25 days');
}

// Market notes — recent insights
const insNote = db.prepare(`
  INSERT OR IGNORE INTO market_notes (title, body, author, category, published_at)
  VALUES (?, ?, ?, ?, datetime('now', ?))
`);
const notes = [
  ['IHSG Tutup Menguat, Investor Asing Net Buy Rp 412 M',
   'Pasar saham Indonesia tutup menguat 0.7% dengan sektor finansial sebagai motor utama. Investor asing mencatat net buy Rp 412 miliar, didominasi BBCA, BBRI, dan BMRI. Sentimen positif datang dari data inflasi Mei yang lebih rendah dari konsensus.',
   'Hendra Saputra', 'market_brief', '-1 days'],
  ['BI Rate Diperkirakan Bertahan 5.75%, Fokus ke Rupiah',
   'Bank Indonesia diprediksi akan mempertahankan BI Rate di 5.75% pada Rapat Dewan Gubernur minggu depan. Fokus utama adalah stabilitas rupiah yang melemah ke Rp 16.250/USD. Strategi sterilisasi via SRBI dan term-deposit valas diperkirakan dilanjutkan.',
   'Rina Hapsari', 'macro', '-3 days'],
  ['Obligasi Negara: Yield 10Y di 6.85%, Demand Lelang Kuat',
   'Lelang SUN minggu ini menunjukkan demand kuat dengan total penawaran masuk Rp 65 triliun untuk target indikatif Rp 24 triliun. Yield FR0095 (10Y) settle di 6.85%, turun dari 6.92% minggu lalu. Investor institusional mulai akumulasi seiring ekspektasi rate cut H2 2026.',
   'Bagus Widyatmoko', 'fixed_income', '-5 days'],
  ['Update Reksadana: Dana Stabil Bertumbuh Naik 1.2% Bulan Ini',
   'Top 5 reksadana saham bulan ini mencatat return rata-rata 1.8% (vs IHSG +1.2%). Schroder Dana Prestasi Plus, Sucorinvest Equity Fund, dan Manulife Dana Saham Kelas A memimpin. Untuk pendapatan tetap, Schroder Dana Stabil Bertumbuh +1.2%.',
   'Devi Anggraeni', 'mutual_fund', '-7 days'],
  ['Sektor Energi: Batubara dan EBT Outlook Q3',
   'Harga batubara Newcastle stabil di USD 138/ton, di bawah ekspektasi awal tahun USD 155. Sektor EBT (Energi Baru Terbarukan) lokal mulai dapat momentum dengan BREN dan PGEO sebagai top picks. Risk: regulasi DMO dan downside coal price.',
   'Hendra Saputra', 'sector', '-10 days'],
  ['Crypto Watch: BTC Konsolidasi USD 68K, Altseason Sinyal?',
   'Bitcoin konsolidasi di kisaran USD 65-70K setelah breakout April. Dominance turun ke 52%, sinyal aliran ke altcoin. ETH/BTC ratio mulai menguat. Risk-on regime tergantung Fed rate path dan flow ETF.',
   'Devi Anggraeni', 'crypto', '-12 days'],
  ['Akuisisi & IPO: Pipeline IPO Q3 2026 Mengarah ke Sektor Konsumer',
   'Pipeline IPO BEI Q3 2026 didominasi sektor konsumer dan healthcare. Estimasi 8-10 emiten baru dengan total fund raising Rp 12-15 triliun. Highlight: PT Sumber Alfaria (alfamart group) reportedly mempertimbangkan IPO subsidiary.',
   'Rina Hapsari', 'corp_action', '-15 days'],
  ['Strategi: Rebalancing untuk Klien Risk Profile Moderate',
   'Untuk klien dengan risk profile moderate, alokasi rekomendasi Q3 2026: saham 40%, obligasi 40%, reksadana campuran 15%, kas/setara 5%. Trim eksposur saham yang sudah outperform >25% YTD. Akumulasi obligasi tenor 5-7Y di yield 6.5%+.',
   'Bagus Widyatmoko', 'strategy', '-2 days']
];
for (const [t, b, au, c, d] of notes) insNote.run(t, b, au, c, d);

// ============================================================
// Query helpers
// ============================================================
const stmtGetUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtGetUserById       = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtCreateUser        = db.prepare(`
  INSERT INTO users (username, password, full_name, email, role, created_at)
  VALUES (?, ?, ?, ?, 'client', datetime('now'))
`);
const stmtCountUsers        = db.prepare('SELECT COUNT(*) as c FROM users');

const stmtPortfoliosByUser  = db.prepare('SELECT * FROM portfolios WHERE user_id = ? ORDER BY id');
const stmtPortfolioById     = db.prepare('SELECT * FROM portfolios WHERE id = ?');
const stmtHoldingsByPort    = db.prepare('SELECT * FROM holdings WHERE portfolio_id = ? ORDER BY asset_class, symbol');
const stmtTxByPort          = db.prepare('SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY id DESC LIMIT ?');

const stmtAllNotes          = db.prepare('SELECT * FROM market_notes ORDER BY published_at DESC LIMIT ?');

const stmtWatchByUser       = db.prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY id DESC');
const stmtAddWatch          = db.prepare(`INSERT OR IGNORE INTO watchlist (user_id, symbol, name, added_at) VALUES (?, ?, ?, datetime('now'))`);
const stmtRmWatch           = db.prepare('DELETE FROM watchlist WHERE user_id = ? AND symbol = ?');

const stmtAllUsers          = db.prepare(`SELECT id, username, full_name, email, role, created_at FROM users ORDER BY id`);

module.exports = {
  db, FLAG,

  hashPassword,

  getUserByUsername: u => stmtGetUserByUsername.get(u),
  getUserById:       id => stmtGetUserById.get(id),
  createUser:        (u, p, n, e) => stmtCreateUser.run(u, p, n, e),
  countUsers:        () => stmtCountUsers.get().c,

  getPortfoliosByUser: uid => stmtPortfoliosByUser.all(uid),
  getPortfolioById:    pid => stmtPortfolioById.get(pid),
  getHoldingsByPort:   pid => stmtHoldingsByPort.all(pid),
  getTransactionsByPort: (pid, lim) => stmtTxByPort.all(pid, lim || 25),

  getMarketNotes:      lim => stmtAllNotes.all(lim || 10),

  getWatchlistByUser:  uid => stmtWatchByUser.all(uid),
  addWatchlist:        (uid, sym, name) => stmtAddWatch.run(uid, sym, name),
  removeWatchlist:     (uid, sym) => stmtRmWatch.run(uid, sym),

  getAllUsers:         () => stmtAllUsers.all()
};
