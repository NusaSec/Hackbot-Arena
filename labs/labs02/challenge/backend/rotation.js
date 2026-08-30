// ============================================================
// Rotation event manager
//
// Emits a key_rotation event every 15 seconds.
//
// Behavior:
//   - Tick 4, 8, 12, ... → ALWAYS vault-keeper (exactly once per minute)
//   - Other ticks       → random pick from REGULAR_SERVICES
//
// vault-keeper is excluded from the random pool entirely so it
// never duplicates within a minute.
// ============================================================
const crypto = require('crypto');
const EventEmitter = require('events');

const REGULAR_SERVICES = [
  { name: 'public-api-gateway',  scopes: ['account:read', 'public:read'],     weight: 4 },
  { name: 'metrics-collector',   scopes: ['metrics:read', 'logs:read'],       weight: 3 },
  { name: 'notification-worker', scopes: ['notifications:send'],              weight: 3 },
  { name: 'webhook-dispatcher',  scopes: ['webhooks:send', 'webhooks:read'],  weight: 2 },
  { name: 'analytics-pipeline',  scopes: ['logs:read', 'metrics:read'],       weight: 2 }
];

const VAULT_SERVICE = {
  name: 'vault-keeper',
  scopes: ['flag:read', 'secrets:read']
};

const VAULT_TICK_INTERVAL = 4;   // every 4th tick (60s with 15s tick)
const TICK_MS = 15000;

function pickWeighted(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function genApiKey(serviceName) {
  const prefix = serviceName === 'vault-keeper' ? 'vk_svc_vault' : 'vk_svc';
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

class RotationManager extends EventEmitter {
  constructor() {
    super();
    this.history = [];
    this.activeKeys = new Map();   // service_name -> { key, scopes }
    this.intervalHandle = null;
    this.tickCount = 0;
  }

  start() {
    if (this.intervalHandle) return;
    this.emitRotation(); // tick #1 immediately so connecting users see something
    this.intervalHandle = setInterval(() => this.emitRotation(), TICK_MS);
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  emitRotation() {
    this.tickCount++;

    // Vault-keeper rotates exactly every 4th tick (60s)
    const isVaultTick = this.tickCount % VAULT_TICK_INTERVAL === 0;
    const service = isVaultTick ? VAULT_SERVICE : pickWeighted(REGULAR_SERVICES);

    const apiKey = genApiKey(service.name);
    const event = {
      type: 'key_rotation',
      timestamp: new Date().toISOString(),
      service: service.name,
      key: apiKey,
      scopes: service.scopes,
      rotated_by: 'system',
      reason: 'scheduled rotation'
    };

    this.activeKeys.set(service.name, { key: apiKey, scopes: service.scopes });

    this.history.push(event);
    if (this.history.length > 5) this.history.shift();

    this.emit('rotation', event);
  }

  getHistory() {
    return [...this.history];
  }

  // Used by /api/v1/flag — checks if a presented key matches
  // any rotated service key with the right scope.
  validateServiceKey(apiKey, requiredScope) {
    for (const [service, info] of this.activeKeys.entries()) {
      if (info.key === apiKey && info.scopes.includes(requiredScope)) {
        return { valid: true, service, scopes: info.scopes };
      }
    }
    return { valid: false };
  }
}

module.exports = new RotationManager();
