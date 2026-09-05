CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  primary_space_mrn TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spaces (
  mrn TEXT PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id BIGSERIAL PRIMARY KEY,
  space_mrn TEXT NOT NULL REFERENCES spaces(mrn) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'active',
  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_secrets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  secret_name TEXT NOT NULL,
  secret_value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_space_state ON assets (space_mrn, lifecycle_state, id);
CREATE INDEX IF NOT EXISTS idx_assets_labels_gin ON assets USING GIN (labels);
CREATE INDEX IF NOT EXISTS idx_tenant_secrets_name ON tenant_secrets (tenant_id, secret_name);

INSERT INTO tenants (slug, name)
VALUES
  ('player-tenant', 'Player Sandbox'),
  ('aurora-finance', 'Aurora Finance')
ON CONFLICT (slug) DO NOTHING;

WITH tenant_rows AS (
  SELECT id, slug FROM tenants WHERE slug IN ('player-tenant', 'aurora-finance')
)
INSERT INTO users (email, password_hash, full_name, role, primary_space_mrn)
VALUES
  (
    'pilot@arena.local',
    '96dbf2265bc5dd3dd7d7bd601ea6e44203216211666730a88fc1a829c83e2617',
    'Pilot One',
    'member',
    '//captain.api.arena.local/spaces/sp_demo_7f3c'
  ),
  (
    'ops@aurora.local',
    '9aa3df14d3dbb24c19ab3a6d7be9f1d1d8eb5938f2d3b2c0c2f1cbaf2b4ff73d',
    'Aurora Ops',
    'member',
    '//captain.api.arena.local/spaces/sp_aurora_42e1'
  )
ON CONFLICT (email) DO NOTHING;

WITH player_tenant AS (
  SELECT id FROM tenants WHERE slug = 'player-tenant'
),
aurora_tenant AS (
  SELECT id FROM tenants WHERE slug = 'aurora-finance'
)
INSERT INTO spaces (mrn, tenant_id, owner_user_id, display_name)
SELECT '//captain.api.arena.local/spaces/sp_demo_7f3c', player_tenant.id, u.id, 'Pilot Sandbox'
FROM player_tenant, users u
WHERE u.email = 'pilot@arena.local'
ON CONFLICT (mrn) DO NOTHING;

WITH aurora_tenant AS (
  SELECT id FROM tenants WHERE slug = 'aurora-finance'
)
INSERT INTO spaces (mrn, tenant_id, owner_user_id, display_name)
SELECT '//captain.api.arena.local/spaces/sp_aurora_42e1', aurora_tenant.id, u.id, 'Aurora Prod'
FROM aurora_tenant, users u
WHERE u.email = 'ops@aurora.local'
ON CONFLICT (mrn) DO NOTHING;

INSERT INTO assets (space_mrn, name, lifecycle_state, labels, notes)
VALUES
  (
    '//captain.api.arena.local/spaces/sp_demo_7f3c',
    'Pilot Laptop',
    'active',
    '{"distro-id":"debian","owner":"pilot","tier":"workstation"}',
    'Reference asset used for normal filtering.'
  ),
  (
    '//captain.api.arena.local/spaces/sp_demo_7f3c',
    'Pilot Build Runner',
    'active',
    '{"distro-id":"ubuntu","owner":"pilot","tier":"ci"}',
    'A second benign row so pagination is visible.'
  ),
  (
    '//captain.api.arena.local/spaces/sp_aurora_42e1',
    'Aurora Secrets Vault',
    'active',
    '{"distro-id":"redhat","owner":"aurora-ops","tier":"vault"}',
    'Foreign tenant secret holder.'
  ),
  (
    '//captain.api.arena.local/spaces/sp_aurora_42e1',
    'Aurora Archive Node',
    'active',
    '{"distro-id":"debian","owner":"aurora-ops","tier":"archive"}',
    'Contains a backup of the same vault data.'
  );

INSERT INTO tenant_secrets (tenant_id, secret_name, secret_value)
SELECT t.id, 'payroll_export_token', 'aurora_live_5f2b91c8e4d7a306'
FROM tenants t
WHERE t.slug = 'aurora-finance'
ON CONFLICT DO NOTHING;

INSERT INTO tenant_secrets (tenant_id, secret_name, secret_value)
SELECT t.id, 'flag', :'flag'
FROM tenants t
WHERE t.slug = 'aurora-finance'
ON CONFLICT DO NOTHING;
