// ============================================================
// SQLite database layer
//
// Uses better-sqlite3 (synchronous API, fast, simple).
// Stores everything in /data/ctf.db (mounted as Docker volume).
// ============================================================

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || '/data/ctf.db';
const FLAG = process.env.FLAG || 'FLAG{nusasec-not-set}';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// Schema
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    api_key TEXT NOT NULL,
    department TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS report_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    processed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS report_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    status INTEGER NOT NULL,
    submitted_by TEXT,
    visited_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_queue_processed ON report_queue (processed, id);
  CREATE INDEX IF NOT EXISTS idx_history_user ON report_history (submitted_by, id DESC);
`);

// ============================================================
// Seed default users (only if not present)
// Admin password and FLAG come from env so they can be rotated
// without rebuilding the DB file.
// ============================================================
function seedUsers() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (username, password, email, role, api_key, department, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    'admin', ADMIN_PASSWORD, 'admin@acme.local', 'admin', FLAG,
    'Engineering', 'Internal admin account. Do not share api_key.',
    '2024-01-01T00:00:00Z'
  );
  insert.run(
    'attacker', 'attacker123', 'attacker@external.local', 'user', 'usr_4f8b2a9c1e7d6f3b',
    'External', 'Standard user account.',
    '2026-01-15T00:00:00Z'
  );
  insert.run(
    'alice', 'alice2026', 'alice@acme.local', 'user', 'usr_8c1d3e5f2a9b4c6e',
    'Marketing', 'Standard user account.',
    '2025-09-12T00:00:00Z'
  );

  // If admin already existed, refresh password and api_key from env
  // (so re-running the container with a different FLAG actually rotates).
  db.prepare('UPDATE users SET password = ?, api_key = ? WHERE username = ?')
    .run(ADMIN_PASSWORD, FLAG, 'admin');
}
seedUsers();

// ============================================================
// User helpers
// ============================================================
const stmtGetUser = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtCreateUser = db.prepare(`
  INSERT INTO users (username, password, email, role, api_key, department, notes, created_at)
  VALUES (@username, @password, @email, @role, @api_key, @department, @notes, @created_at)
`);

function getUser(username) {
  return stmtGetUser.get(username);
}

function createUser({ username, password, email }) {
  const apiKey = 'usr_' + crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();
  stmtCreateUser.run({
    username,
    password,
    email,
    role: 'user',
    api_key: apiKey,
    department: 'External',
    notes: 'Self-registered user.',
    created_at: now
  });
  return getUser(username);
}

// ============================================================
// Report queue
// ============================================================
const stmtEnqueue = db.prepare(`
  INSERT INTO report_queue (path, submitted_by, submitted_at)
  VALUES (?, ?, ?)
`);

const stmtNextTask = db.prepare(`
  SELECT id, path, submitted_by, submitted_at
  FROM report_queue
  WHERE processed = 0
  ORDER BY id ASC
  LIMIT 1
`);

const stmtMarkProcessed = db.prepare(`
  UPDATE report_queue SET processed = 1 WHERE id = ?
`);

function enqueueReport(pathToVisit, submittedBy) {
  stmtEnqueue.run(pathToVisit, submittedBy, new Date().toISOString());
}

// Atomic dequeue: select + mark processed in a single transaction.
const dequeueTxn = db.transaction(() => {
  const task = stmtNextTask.get();
  if (!task) return null;
  stmtMarkProcessed.run(task.id);
  return task;
});

function dequeueReport() {
  return dequeueTxn();
}

// ============================================================
// Report history (per-user filtered for /report page)
// ============================================================
const stmtAddHistory = db.prepare(`
  INSERT INTO report_history (url, status, submitted_by, visited_at)
  VALUES (?, ?, ?, ?)
`);

const stmtUserHistory = db.prepare(`
  SELECT url, status, submitted_by, visited_at
  FROM report_history
  WHERE submitted_by = ?
  ORDER BY id DESC
  LIMIT ?
`);

const stmtUserHistoryCount = db.prepare(`
  SELECT COUNT(*) as count FROM report_history WHERE submitted_by = ?
`);

function addHistory({ url, status, submitted_by }) {
  stmtAddHistory.run(url, status, submitted_by || null, new Date().toISOString());

  // Cap total history at 5000 rows globally to keep DB size bounded
  db.prepare(`
    DELETE FROM report_history
    WHERE id IN (
      SELECT id FROM report_history ORDER BY id DESC LIMIT -1 OFFSET 5000
    )
  `).run();
}

function getUserHistory(username, limit = 10) {
  return stmtUserHistory.all(username, limit);
}

function countUserHistory(username) {
  return stmtUserHistoryCount.get(username).count;
}

module.exports = {
  db,
  getUser,
  createUser,
  enqueueReport,
  dequeueReport,
  addHistory,
  getUserHistory,
  countUserHistory
};
