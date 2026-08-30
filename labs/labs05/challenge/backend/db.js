// ============================================================
// Talenta — HR Portal database (SQLite)
// ============================================================
const Database = require('better-sqlite3');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || '/data/talenta.db';
const FLAG = process.env.FLAG || 'FLAG{nusasec-not-set}';
const AUDIT_KEY = process.env.AUDIT_KEY || 'stg-aud-default';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    password     TEXT NOT NULL,
    employee_id  INTEGER,
    role         TEXT DEFAULT 'employee',
    created_at   TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS departments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    head_id      INTEGER
  );

  CREATE TABLE IF NOT EXISTS employees (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nik             TEXT UNIQUE NOT NULL,
    full_name       TEXT NOT NULL,
    email           TEXT NOT NULL,
    department_id   INTEGER,
    position        TEXT,
    phone           TEXT,
    bank_account    TEXT,
    monthly_salary  INTEGER,
    manager_id      INTEGER,
    joined_at       TEXT NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (manager_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    type         TEXT NOT NULL,
    start_date   TEXT NOT NULL,
    end_date     TEXT NOT NULL,
    reason       TEXT,
    status       TEXT DEFAULT 'pending',
    created_at   TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payslips (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id  INTEGER NOT NULL,
    period       TEXT NOT NULL,
    basic        INTEGER NOT NULL,
    bonus        INTEGER DEFAULT 0,
    deduction    INTEGER DEFAULT 0,
    net          INTEGER NOT NULL,
    issued_at    TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    body         TEXT NOT NULL,
    author       TEXT NOT NULL,
    pinned       INTEGER DEFAULT 0,
    published_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    date  TEXT NOT NULL,
    name  TEXT NOT NULL,
    type  TEXT NOT NULL
  );
`);

// ============================================================
// Seed departments
// ============================================================
const insertDept = db.prepare(`
  INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)
`);
const depts = [
  ['ENG', 'Engineering'],
  ['PNC', 'People & Culture'],
  ['OPS', 'Operations'],
  ['FIN', 'Finance & Accounting'],
  ['MKT', 'Marketing'],
  ['CSM', 'Customer Success']
];
for (const [c, n] of depts) insertDept.run(c, n);

// ============================================================
// Seed employees — 32 employees across departments
// ============================================================
const getDept = db.prepare('SELECT id FROM departments WHERE code = ?');
const insertEmp = db.prepare(`
  INSERT OR IGNORE INTO employees (nik, full_name, email, department_id, position, phone, bank_account, monthly_salary, manager_id, joined_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function emp(nik, name, email, deptCode, position, phone, bank, salary, managerId, joinedAt) {
  const d = getDept.get(deptCode);
  return insertEmp.run(nik, name, email, d && d.id, position, phone, bank, salary, managerId, joinedAt);
}

// Department heads & managers first (so others can reference them)
emp('SP-2018-001', 'Evi Handayani',     '[email protected]',   'ENG', 'VP of Engineering',     '+62-812-1100-0001', 'BCA-1234567001', 45000000, null, '2018-03-12');  // 1
emp('SP-2018-002', 'Rina Cahyani',      '[email protected]',    'PNC', 'Head of People',        '+62-812-1100-0002', 'BCA-1234567002', 38000000, null, '2018-05-20');  // 2
emp('SP-2019-001', 'Yusuf Maulana',     '[email protected]',   'OPS', 'Head of Operations',    '+62-812-1100-0003', 'BCA-1234567003', 36000000, null, '2019-01-15');  // 3
emp('SP-2019-002', 'Dewi Anggraini',    '[email protected]',     'FIN', 'CFO',                   '+62-812-1100-0004', 'BCA-1234567004', 48000000, null, '2019-04-08');  // 4
emp('SP-2020-001', 'Bambang Saputra',   '[email protected]', 'MKT', 'CMO',                   '+62-812-1100-0005', 'BCA-1234567005', 42000000, null, '2020-02-10');  // 5
emp('SP-2020-002', 'Maya Lestari',      '[email protected]',    'CSM', 'Head of CS',            '+62-812-1100-0006', 'BCA-1234567006', 34000000, null, '2020-06-22');  // 6

// Engineering team (reports to Evi, id=1)
emp('SP-2020-010', 'Andika Pratama',    '[email protected]',  'ENG', 'Engineering Manager',   '+62-812-1100-0010', 'BCA-1234567010', 32000000, 1, '2020-08-14');  // 7
emp('SP-2021-001', 'Sinta Kusuma',      '[email protected]',    'ENG', 'Senior Engineer',       '+62-812-1100-0011', 'BCA-1234567011', 28000000, 7, '2021-02-03');
emp('SP-2021-002', 'Raden Wibowo',      '[email protected]',   'ENG', 'Senior Engineer',       '+62-812-1100-0012', 'BCA-1234567012', 27000000, 7, '2021-05-17');
emp('SP-2022-001', 'Putri Anjani',      '[email protected]',    'ENG', 'Engineer',              '+62-812-1100-0013', 'BCA-1234567013', 22000000, 7, '2022-01-10');
emp('SP-2022-002', 'Fajar Nugroho',     '[email protected]',   'ENG', 'Engineer',              '+62-812-1100-0014', 'BCA-1234567014', 21500000, 7, '2022-03-28');
emp('SP-2023-001', 'Lulu Ramadhani',    '[email protected]',     'ENG', 'Junior Engineer',       '+62-812-1100-0015', 'BCA-1234567015', 14000000, 7, '2023-07-05');
emp('SP-2023-002', 'Reza Maulana',      '[email protected]',    'ENG', 'Junior Engineer',       '+62-812-1100-0016', 'BCA-1234567016', 13500000, 7, '2023-09-18');
emp('SP-2024-001', 'Indah Permata',     '[email protected]',   'ENG', 'Site Reliability Engineer', '+62-812-1100-0017', 'BCA-1234567017', 24000000, 1, '2024-01-22');

// People & Culture (reports to Rina, id=2)
emp('SP-2020-020', 'Hesti Marlina',     '[email protected]',   'PNC', 'HR Business Partner',   '+62-812-1100-0020', 'BCA-1234567020', 18000000, 2, '2020-11-04');
emp('SP-2021-010', 'Dimas Setiadi',     '[email protected]',    'PNC', 'Recruiter',             '+62-812-1100-0021', 'BCA-1234567021', 16000000, 2, '2021-08-15');
emp('SP-2023-010', 'Citra Halim',       '[email protected]',     'PNC', 'L&D Specialist',        '+62-812-1100-0022', 'BCA-1234567022', 15000000, 2, '2023-04-12');

// Operations (reports to Yusuf, id=3)
emp('SP-2020-030', 'Agus Wahyudi',      '[email protected]',     'OPS', 'Operations Manager',    '+62-812-1100-0030', 'BCA-1234567030', 24000000, 3, '2020-09-08');
emp('SP-2021-020', 'Mawar Sari',        '[email protected]',     'OPS', 'Procurement',           '+62-812-1100-0031', 'BCA-1234567031', 16000000, 3, '2021-12-01');
emp('SP-2022-010', 'Hadi Sucipto',      '[email protected]',     'OPS', 'Facilities',            '+62-812-1100-0032', 'BCA-1234567032', 13000000, 3, '2022-07-19');

// Finance (reports to Dewi, id=4)
emp('SP-2020-040', 'Lestari Putri',     '[email protected]',  'FIN', 'Finance Manager',       '+62-812-1100-0040', 'BCA-1234567040', 26000000, 4, '2020-10-11');
emp('SP-2021-030', 'Bagus Adi',         '[email protected]',     'FIN', 'Accountant',            '+62-812-1100-0041', 'BCA-1234567041', 17000000, 4, '2021-04-25');
emp('SP-2022-020', 'Sari Indriani',     '[email protected]',     'FIN', 'Accounts Payable',      '+62-812-1100-0042', 'BCA-1234567042', 14000000, 4, '2022-10-08');

// Marketing (reports to Bambang, id=5)
emp('SP-2020-050', 'Ratna Dewi',        '[email protected]',     'MKT', 'Marketing Manager',     '+62-812-1100-0050', 'BCA-1234567050', 24000000, 5, '2020-12-14');
emp('SP-2021-040', 'Iwan Setiawan',     '[email protected]',     'MKT', 'Content Lead',          '+62-812-1100-0051', 'BCA-1234567051', 18000000, 5, '2021-06-30');
emp('SP-2022-030', 'Nadia Salsabila',   '[email protected]',    'MKT', 'Performance Marketer',  '+62-812-1100-0052', 'BCA-1234567052', 19000000, 5, '2022-04-17');
emp('SP-2023-020', 'Galang Pramudya',   '[email protected]',  'MKT', 'Designer',              '+62-812-1100-0053', 'BCA-1234567053', 14000000, 5, '2023-11-22');

// Customer Success (reports to Maya, id=6)
emp('SP-2020-060', 'Tina Wahyuni',      '[email protected]',     'CSM', 'CS Manager',            '+62-812-1100-0060', 'BCA-1234567060', 22000000, 6, '2020-11-29');
emp('SP-2021-050', 'Faiz Hidayat',      '[email protected]',     'CSM', 'CS Engineer',           '+62-812-1100-0061', 'BCA-1234567061', 17000000, 6, '2021-09-13');
emp('SP-2022-040', 'Wulan Pertiwi',     '[email protected]',    'CSM', 'CS Agent',              '+62-812-1100-0062', 'BCA-1234567062', 12000000, 6, '2022-12-05');
emp('SP-2023-030', 'Doni Saputro',      '[email protected]',     'CSM', 'CS Agent',              '+62-812-1100-0063', 'BCA-1234567063', 11500000, 6, '2023-08-21');

// Set department heads
db.prepare('UPDATE departments SET head_id = 1 WHERE code = ?').run('ENG');
db.prepare('UPDATE departments SET head_id = 2 WHERE code = ?').run('PNC');
db.prepare('UPDATE departments SET head_id = 3 WHERE code = ?').run('OPS');
db.prepare('UPDATE departments SET head_id = 4 WHERE code = ?').run('FIN');
db.prepare('UPDATE departments SET head_id = 5 WHERE code = ?').run('MKT');
db.prepare('UPDATE departments SET head_id = 6 WHERE code = ?').run('CSM');

// ============================================================
// Seed announcements
// ============================================================
const insAnno = db.prepare(`
  INSERT OR IGNORE INTO announcements (title, body, author, pinned, published_at)
  VALUES (?, ?, ?, ?, datetime('now', ?))
`);
const annos = [
  ['Townhall Q2 2026 — 30 Mei',
   'Townhall karyawan untuk Q2 2026 akan diadakan tanggal 30 Mei 2026 di Aula Gedung A. Agenda: review performance Q1, OKR Q2, dan sharing dari masing-masing department head. Wajib hadir untuk semua karyawan tetap.',
   'Rina Cahyani', 1, '-3 days'],
  ['Update Sistem Talenta — v2.4.1',
   'Talenta HR Portal versi 2.4.1 sudah deployed. Fitur baru: search employee dengan filter department, payslip viewer dengan export PDF, dan pengajuan cuti lebih cepat. Bug report ke #it-support di Slack.',
   'Evi Handayani', 1, '-5 days'],
  ['Libur Bersama Idul Fitri 2026',
   'Sesuai SKB 3 Menteri, libur bersama Idul Fitri 1447H akan jatuh pada tanggal 24-28 Maret 2026 (Senin-Jumat). Cuti tambahan dapat diambil sebelum atau sesudah periode tersebut dengan approval manager.',
   'Hesti Marlina', 0, '-15 days'],
  ['Welcome New Joiners — April 2026',
   'Mari sambut karyawan baru yang bergabung di April 2026: Lulu Ramadhani (Engineering), Galang Pramudya (Marketing). Mereka akan menjalani orientation week tanggal 7-11 April.',
   'Dimas Setiadi', 0, '-25 days'],
  ['Reminder: Submit Annual Review',
   'Annual performance review untuk tahun fiskal 2025-2026 wajib disubmit paling lambat 15 Juni 2026. Form tersedia di /app setelah login. Untuk pertanyaan, hubungi People & Culture.',
   'Rina Cahyani', 0, '-7 days'],
  ['Maintenance Window — 25 Mei 2026',
   'Sistem Talenta akan offline untuk maintenance terjadwal pada Minggu, 25 Mei 2026 jam 00:00 - 04:00 WIB. Update infrastructure dan database engine. Tidak ada akses selama window ini.',
   'Andika Pratama', 0, '-2 days'],
  ['New Health Insurance Provider',
   'Mulai 1 Juli 2026, provider asuransi kesehatan karyawan beralih dari Asuransi Nusantara ke Mandiri InHealth. Detail coverage akan diumumkan dalam townhall mendatang.',
   'Rina Cahyani', 0, '-10 days'],
  ['Office Renovation — Lantai 12',
   'Renovasi lantai 12 (area Engineering) akan dilakukan tanggal 1-15 Juni. Selama periode tersebut, tim Engineering akan WFH atau pakai meeting room lantai 10.',
   'Yusuf Maulana', 0, '-1 days'],
];
for (const [t, b, a, p, d] of annos) insAnno.run(t, b, a, p, d);

// ============================================================
// Seed holidays (2026)
// ============================================================
const insHol = db.prepare(`INSERT OR IGNORE INTO holidays (date, name, type) VALUES (?, ?, ?)`);
const hols = [
  ['2026-01-01', 'Tahun Baru Masehi', 'national'],
  ['2026-02-17', 'Tahun Baru Imlek 2577', 'national'],
  ['2026-03-22', 'Hari Suci Nyepi', 'national'],
  ['2026-03-25', 'Idul Fitri 1 Syawal 1447H', 'national'],
  ['2026-03-26', 'Idul Fitri 2 Syawal 1447H', 'national'],
  ['2026-03-23', 'Cuti Bersama Idul Fitri', 'cuti_bersama'],
  ['2026-03-24', 'Cuti Bersama Idul Fitri', 'cuti_bersama'],
  ['2026-03-27', 'Cuti Bersama Idul Fitri', 'cuti_bersama'],
  ['2026-04-03', 'Wafat Isa Almasih', 'national'],
  ['2026-05-01', 'Hari Buruh', 'national'],
  ['2026-05-14', 'Kenaikan Isa Almasih', 'national'],
  ['2026-05-21', 'Hari Raya Waisak 2570', 'national'],
  ['2026-06-01', 'Hari Lahir Pancasila', 'national'],
  ['2026-06-12', 'Idul Adha 1447H', 'national'],
  ['2026-07-03', 'Tahun Baru Islam 1448H', 'national'],
  ['2026-08-17', 'Hari Kemerdekaan RI', 'national'],
  ['2026-09-12', 'Maulid Nabi Muhammad SAW', 'national'],
  ['2026-12-25', 'Hari Raya Natal', 'national']
];
for (const [d, n, t] of hols) insHol.run(d, n, t);

// ============================================================
// Seed payslips — last 6 months for each employee
// ============================================================
const allEmps = db.prepare('SELECT id, monthly_salary FROM employees').all();
const insPay = db.prepare(`
  INSERT OR IGNORE INTO payslips (employee_id, period, basic, bonus, deduction, net, issued_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))
`);
const periods = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04'];
const daysAgo = [150, 120, 90, 60, 30];
for (const e of allEmps) {
  const basic = e.monthly_salary;
  for (let i = 0; i < periods.length; i++) {
    const bonus = i === 0 ? Math.floor(basic * 0.25) : 0; // year-end bonus on Dec
    const deduction = Math.floor(basic * 0.08); // BPJS + tax approximation
    const net = basic + bonus - deduction;
    insPay.run(e.id, periods[i], basic, bonus, deduction, net, `-${daysAgo[i]} days`);
  }
}

// ============================================================
// Query helpers
// ============================================================
const stmtGetUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtGetUserById        = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtCreateUser         = db.prepare(`
  INSERT INTO users (username, password, employee_id, role, created_at)
  VALUES (?, ?, NULL, 'employee', datetime('now'))
`);

const stmtAllDepts      = db.prepare('SELECT * FROM departments ORDER BY code');
const stmtDeptById      = db.prepare('SELECT * FROM departments WHERE id = ?');
const stmtDeptByCode    = db.prepare('SELECT * FROM departments WHERE code = ?');
const stmtCountEmpsByDept = db.prepare('SELECT COUNT(*) as c FROM employees WHERE department_id = ?');

const stmtAllEmps       = db.prepare('SELECT * FROM employees ORDER BY full_name');
const stmtEmpById       = db.prepare('SELECT * FROM employees WHERE id = ?');
const stmtEmpsByDept    = db.prepare('SELECT * FROM employees WHERE department_id = ? ORDER BY full_name');
const stmtSearchEmps    = db.prepare(`
  SELECT * FROM employees
  WHERE (full_name LIKE ? OR nik LIKE ? OR email LIKE ?)
  ORDER BY full_name LIMIT ?
`);

const stmtAnnos         = db.prepare('SELECT * FROM announcements ORDER BY pinned DESC, published_at DESC LIMIT ?');
const stmtHolidaysYear  = db.prepare(`SELECT * FROM holidays WHERE date LIKE ? ORDER BY date`);
const stmtAllHolidays   = db.prepare('SELECT * FROM holidays ORDER BY date');

const stmtPayByEmp      = db.prepare('SELECT * FROM payslips WHERE employee_id = ? ORDER BY period DESC');

const stmtLeavesByUser  = db.prepare('SELECT * FROM leave_requests WHERE user_id = ? ORDER BY id DESC');
const stmtInsertLeave   = db.prepare(`
  INSERT INTO leave_requests (user_id, type, start_date, end_date, reason, created_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
`);
const stmtCancelLeave   = db.prepare(`UPDATE leave_requests SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'`);

module.exports = {
  db, FLAG, AUDIT_KEY,

  getUserByUsername:  u => stmtGetUserByUsername.get(u),
  getUserById:        id => stmtGetUserById.get(id),
  createUser:         (u, p) => stmtCreateUser.run(u, p),

  getAllDepartments:  () => stmtAllDepts.all(),
  getDepartmentById:  id => stmtDeptById.get(id),
  getDepartmentByCode: c => stmtDeptByCode.get(c),
  countEmployeesByDept: id => (stmtCountEmpsByDept.get(id) || {}).c || 0,

  getAllEmployees:    () => stmtAllEmps.all(),
  getEmployeeById:    id => stmtEmpById.get(id),
  getEmployeesByDept: id => stmtEmpsByDept.all(id),
  searchEmployees:    (q, lim) => {
    const like = `%${q}%`;
    return stmtSearchEmps.all(like, like, like, lim);
  },

  getAnnouncements:   lim => stmtAnnos.all(lim),
  getHolidays:        year => year ? stmtHolidaysYear.all(`${year}-%`) : stmtAllHolidays.all(),

  getPayslipsByEmployee: eid => stmtPayByEmp.all(eid),

  getLeavesByUser:    uid => stmtLeavesByUser.all(uid),
  insertLeave:        (uid, type, sd, ed, r) => stmtInsertLeave.run(uid, type, sd, ed, r),
  cancelLeave:        (id, uid) => stmtCancelLeave.run(id, uid)
};
