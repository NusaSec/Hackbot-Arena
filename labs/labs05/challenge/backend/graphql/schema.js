// ============================================================
// Talenta — GraphQL schema
// ============================================================
const { buildSchema } = require('graphql');

const SDL = `
"""
Talenta HR Portal — GraphQL API v2.4.1
Internal employee directory and HR self-service for PT Surya Persada.
Build manifest available at the path returned by HealthStatus.buildManifestPath.
"""

scalar Date

type Query {
  """The currently authenticated user (the User object representing the login session)."""
  me: User

  """List all departments in the company."""
  departments: [Department!]!

  """Get a single department by ID."""
  department(id: ID!): Department

  """Search employees by name, NIK, or email. Use department filter to narrow."""
  searchEmployees(query: String, department: String, limit: Int = 20): [Employee!]!

  """Get a single employee by ID."""
  employee(id: ID!): Employee

  """List all employees in the company (paginated)."""
  allEmployees(limit: Int = 50, offset: Int = 0): [Employee!]!

  """Company-wide announcements, sorted with pinned first then by date."""
  announcements(limit: Int = 10): [Announcement!]!

  """Public holidays for the given year (defaults to current year)."""
  publicHolidays(year: Int): [Holiday!]!

  """The current user's leave requests."""
  myLeaveRequests: [LeaveRequest!]!

  """The current user's payslip history (last 6 periods)."""
  myPayslips: [Payslip!]!

  """System health for monitoring/observability."""
  systemHealth: HealthStatus!

  """
  STAGING DIAGNOSTICS ONLY — DO NOT REMOVE
  Internal audit query used by automated regression tests and ops dashboard.
  Required argument runtimeKey is published in the build manifest under the
  field 'audit_key'. See HealthStatus.buildManifestPath for the manifest URL.
  """
  _systemAudit(runtimeKey: String!): SystemAudit
}

type Mutation {
  """Submit a new leave request. Status will be 'pending' until approved."""
  submitLeaveRequest(type: String!, startDate: String!, endDate: String!, reason: String): LeaveRequest

  """Cancel a pending leave request owned by the current user."""
  cancelLeaveRequest(id: ID!): Boolean
}

"""A user account (login identity, separate from the Employee record)."""
type User {
  id: ID!
  username: String!
  role: String!
  createdAt: String!
}

"""An employee in the company directory."""
type Employee {
  id: ID!
  nik: String!
  fullName: String!
  email: String!
  department: Department
  position: String
  joinedAt: String!
  manager: Employee

  """Direct reports (employees managed by this employee)."""
  reports: [Employee!]!
}

"""A department/team within the company."""
type Department {
  id: ID!
  code: String!
  name: String!
  head: Employee
  employeeCount: Int!
  employees(limit: Int = 50): [Employee!]!
}

"""A leave request submitted by an employee."""
type LeaveRequest {
  id: ID!
  type: String!
  startDate: String!
  endDate: String!
  reason: String
  status: String!
  createdAt: String!
}

"""A payslip representing one month of salary disbursement."""
type Payslip {
  id: ID!
  period: String!
  basic: Float!
  bonus: Float!
  deduction: Float!
  net: Float!
  issuedAt: String!
}

"""A company-wide announcement."""
type Announcement {
  id: ID!
  title: String!
  body: String!
  author: String!
  pinned: Boolean!
  publishedAt: String!
}

"""A public or company holiday."""
type Holiday {
  date: String!
  name: String!
  type: String!
}

"""System health status returned by monitoring endpoints."""
type HealthStatus {
  status: String!
  version: String!
  uptimeSeconds: Int!

  """The path to the build manifest. Operations team uses this for diagnostics."""
  buildManifestPath: String
}

"""System audit information — staging only, do not enable in production."""
type SystemAudit {
  runtimeVersion: String!
  buildHash: String!
  databaseEngine: String!
  cacheBackend: String!
  mailerDsn: String!
  sentryDsn: String!

  """Runtime internal secret. Used internally for cross-service auth."""
  internalSecret: String!
}
`;

module.exports = buildSchema(SDL);
