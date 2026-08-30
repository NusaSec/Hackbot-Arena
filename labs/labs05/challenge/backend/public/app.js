// ============================================================
// Talenta SPA — single page HR directory
// ============================================================
(function () {
  'use strict';

  const CTX = window.__TALENTA__ || {};
  const API = CTX.apiPath || '/api/graphql';
  const ME = CTX.user || null;

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  function el(id) { return document.getElementById(id); }

  async function gql(query, variables) {
    const res = await fetch(API, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    return await res.json();
  }

  function fmtIDR(n) {
    if (n === null || n === undefined) return '—';
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  }

  function fmtDate(s) {
    if (!s) return '—';
    return s.slice(0, 10);
  }

  // ============================================================
  // Build shell
  // ============================================================
  function buildShell() {
    const root = el('app-root');
    root.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark"><span>T</span></div>
          <div class="brand-text">talenta<em>.hr</em></div>
        </div>
        <div class="topbar-spacer"></div>
        <nav class="topnav">
          <a href="#" data-view="directory" class="topnav-link active">Direktori</a>
          <a href="#" data-view="announcements" class="topnav-link">Pengumuman</a>
          <a href="#" data-view="myleave" class="topnav-link">Cuti Saya</a>
          <a href="#" data-view="mypayslip" class="topnav-link">Payslip</a>
        </nav>
        <div class="topbar-user">
          <span class="user-name">${esc(ME.username)}</span>
          <span class="user-role">${esc(ME.role)}</span>
          <a class="btn-logout" href="/logout">Logout</a>
        </div>
      </header>
      <main class="layout">
        <section id="view-directory" class="view active">
          <h1 class="page-title">Direktori Karyawan</h1>
          <p class="page-sub">Cari karyawan berdasarkan nama, NIK, atau email. Filter dengan department.</p>
          <div class="filter-row">
            <input id="search-input" class="filter-input" type="text" placeholder="Cari nama, NIK, atau email…">
            <select id="dept-filter" class="filter-input">
              <option value="">Semua department</option>
            </select>
          </div>
          <div id="dept-overview" class="dept-grid"></div>
          <h2 class="section-title">Karyawan</h2>
          <div id="employee-list" class="employee-grid"></div>
        </section>

        <section id="view-announcements" class="view">
          <h1 class="page-title">Pengumuman Perusahaan</h1>
          <p class="page-sub">Update terbaru dari People &amp; Culture dan tim leadership.</p>
          <div id="announcement-list" class="anno-list"></div>
        </section>

        <section id="view-myleave" class="view">
          <h1 class="page-title">Cuti Saya</h1>
          <p class="page-sub">Riwayat dan status pengajuan cuti.</p>
          <div class="card">
            <h3 class="card-title">Ajukan Cuti Baru</h3>
            <form id="leave-form" class="leave-form">
              <div class="form-row">
                <label>Jenis</label>
                <select name="type" required>
                  <option value="annual">Cuti Tahunan</option>
                  <option value="sick">Cuti Sakit</option>
                  <option value="personal">Cuti Pribadi</option>
                  <option value="maternity">Cuti Melahirkan</option>
                  <option value="paternity">Cuti Ayah</option>
                </select>
              </div>
              <div class="form-row">
                <label>Tanggal Mulai</label>
                <input type="date" name="startDate" required>
              </div>
              <div class="form-row">
                <label>Tanggal Selesai</label>
                <input type="date" name="endDate" required>
              </div>
              <div class="form-row">
                <label>Alasan</label>
                <input type="text" name="reason" placeholder="Optional">
              </div>
              <button type="submit" class="btn-primary">Submit</button>
            </form>
          </div>
          <h2 class="section-title">Riwayat</h2>
          <div id="leave-list"></div>
        </section>

        <section id="view-mypayslip" class="view">
          <h1 class="page-title">Payslip Saya</h1>
          <p class="page-sub">Riwayat slip gaji 6 bulan terakhir.</p>
          <div id="payslip-list"></div>
        </section>
      </main>
      <div id="modal-root"></div>
    `;

    // nav switching
    document.querySelectorAll('.topnav-link').forEach(a => {
      a.addEventListener('click', ev => {
        ev.preventDefault();
        const v = a.dataset.view;
        switchView(v);
      });
    });

    el('search-input').addEventListener('input', debounce(loadEmployees, 250));
    el('dept-filter').addEventListener('change', loadEmployees);
    el('leave-form').addEventListener('submit', submitLeave);
  }

  function switchView(name) {
    document.querySelectorAll('.topnav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.view === name);
    });
    document.querySelectorAll('.view').forEach(s => {
      s.classList.toggle('active', s.id === 'view-' + name);
    });
    if (name === 'announcements') loadAnnouncements();
    if (name === 'myleave') loadLeaves();
    if (name === 'mypayslip') loadPayslips();
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments, self = this;
      t = setTimeout(() => fn.apply(self, args), ms);
    };
  }

  // ============================================================
  // Data loaders
  // ============================================================
  async function loadDepartments() {
    const r = await gql(`
      query {
        departments { id code name employeeCount head { fullName } }
      }
    `);
    const depts = (r.data && r.data.departments) || [];
    const sel = el('dept-filter');
    for (const d of depts) {
      const opt = document.createElement('option');
      opt.value = d.code;
      opt.textContent = d.name;
      sel.appendChild(opt);
    }
    el('dept-overview').innerHTML = depts.map(d => `
      <div class="dept-card" data-code="${esc(d.code)}">
        <div class="dept-code">${esc(d.code)}</div>
        <div class="dept-name">${esc(d.name)}</div>
        <div class="dept-meta">${d.employeeCount} karyawan</div>
        ${d.head ? '<div class="dept-head">Head: ' + esc(d.head.fullName) + '</div>' : ''}
      </div>
    `).join('');
    document.querySelectorAll('.dept-card').forEach(c => {
      c.addEventListener('click', () => {
        sel.value = c.dataset.code;
        loadEmployees();
      });
    });
  }

  async function loadEmployees() {
    const q = el('search-input').value.trim();
    const dept = el('dept-filter').value;
    const r = await gql(`
      query Search($query: String, $department: String, $limit: Int) {
        searchEmployees(query: $query, department: $department, limit: $limit) {
          id nik fullName email position joinedAt
          department { code name }
          manager { fullName }
        }
      }
    `, { query: q || null, department: dept || null, limit: 50 });

    const emps = (r.data && r.data.searchEmployees) || [];
    el('employee-list').innerHTML = emps.length === 0
      ? '<div class="empty">Tidak ada karyawan ditemukan.</div>'
      : emps.map(e => `
        <div class="emp-card" data-id="${esc(e.id)}">
          <div class="emp-avatar">${esc(e.fullName.slice(0,2).toUpperCase())}</div>
          <div class="emp-info">
            <div class="emp-name">${esc(e.fullName)}</div>
            <div class="emp-position">${esc(e.position || '—')}</div>
            <div class="emp-meta">
              <span class="emp-dept">${esc((e.department && e.department.code) || '—')}</span>
              · <span>${esc(e.nik)}</span>
              · <span>${esc(e.email)}</span>
            </div>
            ${e.manager ? '<div class="emp-mgr">Manager: ' + esc(e.manager.fullName) + '</div>' : ''}
          </div>
        </div>
      `).join('');

    document.querySelectorAll('.emp-card').forEach(c => {
      c.addEventListener('click', () => showEmployeeDetail(c.dataset.id));
    });
  }

  async function showEmployeeDetail(id) {
    const r = await gql(`
      query Detail($id: ID!) {
        employee(id: $id) {
          id nik fullName email position joinedAt
          department { code name }
          manager { fullName }
          reports { id fullName position }
        }
      }
    `, { id });
    const e = r.data && r.data.employee;
    if (!e) return;
    const modal = el('modal-root');
    modal.innerHTML = `
      <div class="modal-bg" id="modal-bg">
        <div class="modal">
          <div class="modal-head">
            <div class="emp-avatar emp-avatar-lg">${esc(e.fullName.slice(0,2).toUpperCase())}</div>
            <div>
              <div class="modal-name">${esc(e.fullName)}</div>
              <div class="modal-pos">${esc(e.position || '—')} · ${esc((e.department && e.department.name) || '—')}</div>
            </div>
            <button class="modal-close" id="modal-close-btn">×</button>
          </div>
          <div class="modal-body">
            <div class="kv-row"><span class="kv-k">NIK</span><span class="kv-v">${esc(e.nik)}</span></div>
            <div class="kv-row"><span class="kv-k">Email</span><span class="kv-v">${esc(e.email)}</span></div>
            <div class="kv-row"><span class="kv-k">Departemen</span><span class="kv-v">${esc((e.department && e.department.name) || '—')}</span></div>
            <div class="kv-row"><span class="kv-k">Manager</span><span class="kv-v">${esc((e.manager && e.manager.fullName) || '—')}</span></div>
            <div class="kv-row"><span class="kv-k">Bergabung</span><span class="kv-v">${esc(fmtDate(e.joinedAt))}</span></div>
            ${e.reports && e.reports.length > 0 ? `
              <h3 class="modal-section">Direct Reports (${e.reports.length})</h3>
              <ul class="report-list">
                ${e.reports.map(r => '<li><strong>' + esc(r.fullName) + '</strong> · ' + esc(r.position || '—') + '</li>').join('')}
              </ul>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    el('modal-bg').addEventListener('click', ev => { if (ev.target.id === 'modal-bg') modal.innerHTML = ''; });
    el('modal-close-btn').addEventListener('click', () => modal.innerHTML = '');
  }

  async function loadAnnouncements() {
    const r = await gql(`
      query { announcements(limit: 20) { id title body author pinned publishedAt } }
    `);
    const list = (r.data && r.data.announcements) || [];
    el('announcement-list').innerHTML = list.map(a => `
      <article class="anno-card ${a.pinned ? 'pinned' : ''}">
        <h3>${a.pinned ? '📌 ' : ''}${esc(a.title)}</h3>
        <div class="anno-meta">${esc(a.author)} · ${esc(fmtDate(a.publishedAt))}</div>
        <p>${esc(a.body)}</p>
      </article>
    `).join('') || '<div class="empty">Belum ada pengumuman.</div>';
  }

  async function loadLeaves() {
    const r = await gql(`
      query { myLeaveRequests { id type startDate endDate reason status createdAt } }
    `);
    const list = (r.data && r.data.myLeaveRequests) || [];
    el('leave-list').innerHTML = list.length === 0
      ? '<div class="empty">Belum ada pengajuan cuti.</div>'
      : `<table class="data-table">
          <thead><tr><th>Jenis</th><th>Tanggal</th><th>Alasan</th><th>Status</th></tr></thead>
          <tbody>
            ${list.map(l => `
              <tr>
                <td>${esc(l.type)}</td>
                <td>${esc(fmtDate(l.startDate))} → ${esc(fmtDate(l.endDate))}</td>
                <td>${esc(l.reason || '—')}</td>
                <td><span class="badge badge-${esc(l.status)}">${esc(l.status)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
  }

  async function submitLeave(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const r = await gql(`
      mutation Submit($type: String!, $startDate: String!, $endDate: String!, $reason: String) {
        submitLeaveRequest(type: $type, startDate: $startDate, endDate: $endDate, reason: $reason) {
          id status
        }
      }
    `, {
      type: fd.get('type'),
      startDate: fd.get('startDate'),
      endDate: fd.get('endDate'),
      reason: fd.get('reason') || null
    });
    if (r.errors) {
      alert('Error: ' + r.errors.map(e => e.message).join(', '));
      return;
    }
    ev.target.reset();
    loadLeaves();
  }

  async function loadPayslips() {
    const r = await gql(`
      query { myPayslips { id period basic bonus deduction net issuedAt } }
    `);
    const list = (r.data && r.data.myPayslips) || [];
    el('payslip-list').innerHTML = list.length === 0
      ? '<div class="empty">Belum ada payslip. Akun Anda belum terhubung ke employee record.</div>'
      : `<table class="data-table">
          <thead><tr><th>Periode</th><th>Basic</th><th>Bonus</th><th>Deduction</th><th class="ta-right">Net</th></tr></thead>
          <tbody>
            ${list.map(p => `
              <tr>
                <td>${esc(p.period)}</td>
                <td>${fmtIDR(p.basic)}</td>
                <td>${fmtIDR(p.bonus)}</td>
                <td>${fmtIDR(p.deduction)}</td>
                <td class="ta-right"><strong>${fmtIDR(p.net)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
  }

  // ============================================================
  // Init
  // ============================================================
  async function init() {
    if (!ME) { location.href = '/login'; return; }
    buildShell();
    await loadDepartments();
    await loadEmployees();
  }
  init();
})();
