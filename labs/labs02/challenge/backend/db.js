// ============================================================
// SQLite database for VaultKey
// ============================================================
const Database = require('better-sqlite3');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || '/data/vault.db';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    email TEXT NOT NULL,
    api_key TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT 'account:read',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_apikey ON users (api_key);
`);

const stmtGetUser = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtGetUserByKey = db.prepare('SELECT * FROM users WHERE api_key = ?');
const stmtCreateUser = db.prepare(`
  INSERT INTO users (username, password, email, api_key, scopes, created_at)
  VALUES (@username, @password, @email, @api_key, @scopes, @created_at)
`);

function getUser(username) {
  return stmtGetUser.get(username);
}

function getUserByApiKey(apiKey) {
  return stmtGetUserByKey.get(apiKey);
}

function createUser({ username, password, email }) {
  const apiKey = 'vk_user_' + crypto.randomBytes(12).toString('hex');
  stmtCreateUser.run({
    username,
    password,
    email,
    api_key: apiKey,
    scopes: 'account:read',
    created_at: new Date().toISOString()
  });
  return getUser(username);
}

module.exports = {
  db,
  getUser,
  getUserByApiKey,
  createUser
};
