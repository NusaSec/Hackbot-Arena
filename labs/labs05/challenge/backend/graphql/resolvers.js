// ============================================================
// Talenta — GraphQL resolvers
//
// Using `buildSchema` from graphql package, resolvers are passed as `rootValue`.
// Each top-level Query/Mutation field is a function that receives (args, context, info).
// For nested fields (e.g., Employee.department), we wrap each returned row with
// a thin object that exposes those nested resolvers as methods.
// ============================================================
const os = require('os');
const crypto = require('crypto');
const db = require('../db');

const BOOT_TIME = Date.now();

function wrapEmployee(row) {
  if (!row) return null;
  return {
    id: row.id,
    nik: row.nik,
    fullName: row.full_name,
    email: row.email,
    position: row.position,
    joinedAt: row.joined_at,

    department: () => {
      if (!row.department_id) return null;
      return wrapDepartment(db.getDepartmentById(row.department_id));
    },
    manager: () => {
      if (!row.manager_id) return null;
      return wrapEmployee(db.getEmployeeById(row.manager_id));
    },
    reports: () => {
      const all = db.getAllEmployees().filter(e => e.manager_id === row.id);
      return all.map(wrapEmployee);
    }
  };
}

function wrapDepartment(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,

    head: () => row.head_id ? wrapEmployee(db.getEmployeeById(row.head_id)) : null,
    employeeCount: () => db.countEmployeesByDept(row.id),
    employees: ({ limit = 50 }) => db.getEmployeesByDept(row.id).slice(0, limit).map(wrapEmployee)
  };
}

function wrapPayslip(row) {
  return {
    id: row.id,
    period: row.period,
    basic: row.basic,
    bonus: row.bonus,
    deduction: row.deduction,
    net: row.net,
    issuedAt: row.issued_at
  };
}

function wrapLeave(row) {
  return {
    id: row.id,
    type: row.type,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at
  };
}

function wrapAnnouncement(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    author: row.author,
    pinned: !!row.pinned,
    publishedAt: row.published_at
  };
}

function requireAuth(context) {
  if (!context || !context.user) {
    throw new Error('Not authenticated. Login required.');
  }
  return context.user;
}

const resolvers = {
  // ============================================================
  // Query resolvers
  // ============================================================
  me: (args, context) => {
    const user = requireAuth(context);
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.created_at
    };
  },

  departments: (args, context) => {
    requireAuth(context);
    return db.getAllDepartments().map(wrapDepartment);
  },

  department: ({ id }, context) => {
    requireAuth(context);
    return wrapDepartment(db.getDepartmentById(parseInt(id, 10)));
  },

  searchEmployees: ({ query, department, limit = 20 }, context) => {
    requireAuth(context);
    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    let rows;
    if (query && query.trim()) {
      rows = db.searchEmployees(query.trim(), lim);
    } else if (department) {
      const d = db.getDepartmentByCode(department);
      rows = d ? db.getEmployeesByDept(d.id).slice(0, lim) : [];
    } else {
      rows = db.getAllEmployees().slice(0, lim);
    }
    if (department && query) {
      const d = db.getDepartmentByCode(department);
      if (d) rows = rows.filter(r => r.department_id === d.id);
    }
    return rows.map(wrapEmployee);
  },

  employee: ({ id }, context) => {
    requireAuth(context);
    return wrapEmployee(db.getEmployeeById(parseInt(id, 10)));
  },

  allEmployees: ({ limit = 50, offset = 0 }, context) => {
    requireAuth(context);
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    return db.getAllEmployees().slice(off, off + lim).map(wrapEmployee);
  },

  announcements: ({ limit = 10 }, context) => {
    requireAuth(context);
    const lim = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    return db.getAnnouncements(lim).map(wrapAnnouncement);
  },

  publicHolidays: ({ year }, context) => {
    requireAuth(context);
    return db.getHolidays(year || null).map(h => ({
      date: h.date,
      name: h.name,
      type: h.type
    }));
  },

  myLeaveRequests: (args, context) => {
    const user = requireAuth(context);
    return db.getLeavesByUser(user.id).map(wrapLeave);
  },

  myPayslips: (args, context) => {
    const user = requireAuth(context);
    if (!user.employee_id) return [];
    return db.getPayslipsByEmployee(user.employee_id).map(wrapPayslip);
  },

  systemHealth: () => {
    return {
      status: 'ok',
      version: '2.4.1',
      uptimeSeconds: Math.floor((Date.now() - BOOT_TIME) / 1000),
      buildManifestPath: '/api/internal/build-manifest'
    };
  },

  // ============================================================
  // Hidden audit query (the bug)
  // ============================================================
  _systemAudit: ({ runtimeKey }, context) => {
    // Note: no role check. Any authenticated user can call this if they
    // know the runtime key. Key validation is the only barrier.
    requireAuth(context);

    if (runtimeKey !== db.AUDIT_KEY) {
      throw new Error('Invalid runtime key. Check build manifest for current key.');
    }

    return {
      runtimeVersion: process.version,
      buildHash: crypto.createHash('sha1').update('talenta-prod-' + db.AUDIT_KEY).digest('hex').slice(0, 12),
      databaseEngine: 'sqlite-3.45',
      cacheBackend: 'memory',
      mailerDsn: 'smtps://internal-mailer.suryapersada.id:465',
      sentryDsn: 'https://[email protected]/talenta',
      internalSecret: db.FLAG
    };
  },

  // ============================================================
  // Mutation resolvers
  // ============================================================
  submitLeaveRequest: ({ type, startDate, endDate, reason }, context) => {
    const user = requireAuth(context);
    const validTypes = ['annual', 'sick', 'personal', 'maternity', 'paternity'];
    if (!validTypes.includes(type)) {
      throw new Error('Invalid leave type. Allowed: ' + validTypes.join(', '));
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error('Dates must be YYYY-MM-DD format');
    }
    const r = db.insertLeave(user.id, type, startDate, endDate, reason || null);
    return wrapLeave({
      id: r.lastInsertRowid,
      type, start_date: startDate, end_date: endDate,
      reason: reason || null, status: 'pending',
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
    });
  },

  cancelLeaveRequest: ({ id }, context) => {
    const user = requireAuth(context);
    const r = db.cancelLeave(parseInt(id, 10), user.id);
    return r.changes > 0;
  }
};

module.exports = resolvers;
