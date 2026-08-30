// ============================================================
// Admin reviewer bot
//
// Behavior:
//  1. Logs in as admin against the nginx front (so cache sees
//     responses with admin's session cookie).
//  2. Polls the internal queue every 5 seconds.
//  3. For each task, visits the path as the logged-in admin
//     so any cacheable response gets stored.
//  4. Reports back to backend so player sees feedback.
// ============================================================

const TARGET_BASE = process.env.TARGET_BASE || 'http://nginx';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
const QUEUE_POLL_URL = process.env.QUEUE_POLL_URL || 'http://backend:3000/internal/queue/next';
const RESULT_URL = (process.env.QUEUE_POLL_URL || 'http://backend:3000/internal/queue/next')
  .replace('/queue/next', '/queue/result');
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'bot-internal-token-do-not-leak';
const POLL_INTERVAL_MS = 5000;

let sessionCookie = null;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function login() {
  const body = `username=${encodeURIComponent(ADMIN_USER)}&password=${encodeURIComponent(ADMIN_PASS)}`;
  const res = await fetch(`${TARGET_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual'
  });
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('login: no set-cookie returned (status ' + res.status + ')');
  }
  // Take the first cookie (connect.sid=...; ...)
  sessionCookie = setCookie.split(';')[0];
  console.log(`[bot] logged in as ${ADMIN_USER}, cookie acquired`);
}

async function visit(pathToVisit) {
  if (!sessionCookie) await login();

  const url = `${TARGET_BASE}${pathToVisit}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'User-Agent': 'AcmeAdminReviewer/1.0'
      },
      redirect: 'manual'
    });
  } catch (e) {
    console.log(`[bot] visit error: ${e.message}`);
    return { status: 'error', detail: e.message };
  }

  // If session expired, re-login and try once
  if (res.status === 401) {
    console.log('[bot] session expired, relogging in');
    sessionCookie = null;
    await login();
    res = await fetch(url, {
      headers: { 'Cookie': sessionCookie, 'User-Agent': 'AcmeAdminReviewer/1.0' },
      redirect: 'manual'
    });
  }

  console.log(`[bot] visited ${url} -> ${res.status}`);
  return { status: res.status };
}

async function reportResult(url, status, submitted_by) {
  try {
    await fetch(RESULT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': INTERNAL_TOKEN
      },
      body: JSON.stringify({ url, status, submitted_by })
    });
  } catch (e) {
    console.log(`[bot] failed to report result: ${e.message}`);
  }
}

async function pollOnce() {
  let res;
  try {
    res = await fetch(QUEUE_POLL_URL, {
      headers: { 'X-Internal-Token': INTERNAL_TOKEN }
    });
  } catch (e) {
    console.log(`[bot] queue poll failed: ${e.message}`);
    return;
  }

  if (!res.ok) {
    console.log(`[bot] queue returned ${res.status}`);
    return;
  }

  const data = await res.json();
  if (!data.task) return;

  const { path: pathToVisit, submitted_by } = data.task;
  const result = await visit(pathToVisit);
  await reportResult(pathToVisit, result.status, submitted_by);
}

async function main() {
  console.log('[bot] starting admin reviewer bot');
  console.log(`[bot] target: ${TARGET_BASE}`);
  console.log(`[bot] queue: ${QUEUE_POLL_URL}`);

  // Wait a bit for backend/nginx to come up
  await sleep(3000);

  // Initial login (with retry)
  for (let i = 0; i < 10; i++) {
    try {
      await login();
      break;
    } catch (e) {
      console.log(`[bot] login attempt ${i + 1} failed: ${e.message}`);
      await sleep(2000);
    }
  }

  while (true) {
    try {
      await pollOnce();
    } catch (e) {
      console.log(`[bot] poll error: ${e.message}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch(e => {
  console.error('[bot] fatal:', e);
  process.exit(1);
});
