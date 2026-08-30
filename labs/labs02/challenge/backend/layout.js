// ============================================================
// HTML layout helpers
// ============================================================

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NAV = [
  {
    section: 'Workspace',
    items: [
      { href: '/', label: 'Dashboard', key: 'dashboard', icon: '◇' },
      { href: '/markets', label: 'Live Markets', key: 'markets', icon: '◐' },
      { href: '/keys', label: 'API Keys', key: 'keys', icon: '◈' },
      { href: '/account', label: 'Account', key: 'account', icon: '○' }
    ]
  },
  {
    section: 'Developers',
    items: [
      { href: '/docs', label: 'API Reference', key: 'docs', icon: '⌘' }
    ]
  }
];

function renderShell({ title, body, user, flash, activeNav }) {
  if (!user) {
    // Auth pages get a different layout (no sidebar)
    return renderAuthShell({ title, body, flash });
  }

  const flashHtml = flash
    ? `<div class="flash flash-${flash.type}">${escapeHtml(flash.message)}</div>`
    : '';

  const navHtml = NAV.map(section => `
    <div class="sidebar-section">${escapeHtml(section.section)}</div>
    <nav class="sidebar-nav">
      ${section.items.map(item => `
        <a href="${item.href}" class="${activeNav === item.key ? 'active' : ''}">
          <span class="icon">${item.icon}</span>
          <span>${escapeHtml(item.label)}</span>
        </a>
      `).join('')}
    </nav>
  `).join('');

  const initials = (user.username || '?').slice(0, 2).toUpperCase();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Acme Vault</title>
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
<div class="app-layout">
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="mark">A</div>
      <div class="name">Acme<em>Vault</em></div>
    </div>
    ${navHtml}
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="avatar">${escapeHtml(initials)}</div>
        <div class="info">
          <div class="username">${escapeHtml(user.username)}</div>
          <div class="email">${escapeHtml(user.email || '')}</div>
        </div>
      </div>
      <a href="/logout" style="color: #6c7e91; font-size: 12px;">Sign out →</a>
    </div>
  </aside>
  <main class="main">
    <div class="topbar">
      <div class="crumbs">${escapeHtml(title)}</div>
      <div class="topbar-actions">
        <a href="/docs" class="btn btn-secondary btn-sm">API Reference</a>
      </div>
    </div>
    <div class="content">
      ${flashHtml}
      ${body}
    </div>
  </main>
</div>
</body>
</html>`;
}

function renderAuthShell({ title, body, flash }) {
  const flashHtml = flash
    ? `<div class="flash flash-${flash.type}">${escapeHtml(flash.message)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Acme Vault</title>
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
<div class="auth-wrapper">
  <div class="auth-card">
    <div class="auth-brand">
      <div class="mark">A</div>
      <div class="name">Acme Vault</div>
    </div>
    ${flashHtml}
    ${body}
  </div>
</div>
</body>
</html>`;
}

module.exports = { escapeHtml, renderShell };
