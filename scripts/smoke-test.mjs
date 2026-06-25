import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const client = {
  id: 2,
  email: 'demo-user',
  subId: 'secret-sub-id-1234567890',
  uuid: 'c094909d-5a0b-4303-a6ec-5bcba9e41c57',
  password: 'secret-password-123456',
  auth: 'secret-auth-123456',
  flow: '',
  security: 'auto',
  limitIp: 0,
  totalGB: 2147483648,
  expiryTime: 0,
  enable: true,
  tgId: 0,
  group: '',
  comment: 'mock client',
  reset: 1,
  createdAt: 1781721296542,
  updatedAt: 1781957320362,
  reverse: null
};

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function request(url, options = {}) {
  return fetch(url, options).then(async (res) => ({
    status: res.status,
    headers: res.headers,
    text: await res.text()
  }));
}

async function waitFor(url, timeoutMs = 8000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError || new Error(`Timeout waiting for ${url}`);
}

const panel = http.createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer test-token') {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, msg: 'unauthorized' }));
    return;
  }

  if (req.url.startsWith('/panel/api/clients/get/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      msg: '',
      obj: {
        client,
        inboundIds: [2],
        usedTraffic: 1637422
      }
    }));
    return;
  }

  if (req.url.startsWith('/panel/api/clients/subLinks/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      msg: '',
      obj: [
        'vmess://mock-config-one#Demo%20VMess',
        'vless://mock-config-two@example.com:443?encryption=none&allowInsecure=0&type=ws#Demo%20VLESS'
      ]
    }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ success: false, msg: 'not found' }));
});

const testDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'v2-sub-page-data-'));
const echFilePath = path.join(testDataDir, 'last_ech.txt');
const hostsFilePath = path.join(testDataDir, 'hosts.txt');
await fs.writeFile(echFilePath, 'A+B/C=\n');
await fs.writeFile(hostsFilePath, 'alt1.example.com\nalt2.example.com\n');

const panelPort = await listen(panel);
const appPortServer = http.createServer();
const appPort = await listen(appPortServer);
await new Promise((resolve) => appPortServer.close(resolve));

const child = spawn(process.execPath, ['server.js'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(appPort),
    PANEL_BASE_URL: `http://127.0.0.1:${panelPort}`,
    PANEL_API_TOKEN: 'test-token',
    PUBLIC_BASE_URL: `http://127.0.0.1:${appPort}`,
    SECRET_PATH: 'secret-test',
    ACCESS_KEY: 'test-key',
    ECH_FILE_PATH: echFilePath,
    HOSTS_FILE_PATH: hostsFilePath,
    HOSTS_API_PATH: 'private-hosts-api'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

try {
  const base = `http://127.0.0.1:${appPort}`;
  await waitFor(`${base}/healthz`);

  const health = await request(`${base}/healthz`);
  if (health.status !== 200) throw new Error(`healthz failed: ${health.status}`);

  const root = await request(`${base}/`);
  if (root.status !== 404) throw new Error(`root should be 404 when SECRET_PATH is set, got ${root.status}`);

  const page = await request(`${base}/secret-test/u/demo-user?key=test-key`);
  if (page.status !== 200 || !page.text.includes('اشتراک کاربر')) {
    throw new Error(`user page failed: ${page.status}`);
  }

  const hostsPage = await request(`${base}/secret-test/hosts?key=test-key`);
  if (hostsPage.status !== 200 || !hostsPage.text.includes('مدیریت هاست‌های اضافه')) {
    throw new Error(`hosts page failed: ${hostsPage.status}`);
  }

  const hostsEnv = await request(`${base}/secret-test/hosts-env.js`);
  if (hostsEnv.status !== 200 || !hostsEnv.text.includes('/private-hosts-api')) {
    throw new Error(`hosts env js failed: ${hostsEnv.status} ${hostsEnv.text}`);
  }

  const oldHostsApi = await request(`${base}/secret-test/api/hosts?key=test-key`);
  if (oldHostsApi.status !== 404) {
    throw new Error(`default hosts api should be hidden when HOSTS_API_PATH is custom, got ${oldHostsApi.status}`);
  }

  const hostsApi = await request(`${base}/secret-test/private-hosts-api?key=test-key`);
  if (hostsApi.status !== 200) throw new Error(`hosts api failed: ${hostsApi.status} ${hostsApi.text}`);
  const hostsJson = JSON.parse(hostsApi.text);
  if (!hostsJson.success || hostsJson.obj.hosts.length !== 2 || !hostsJson.obj.text.includes('alt1.example.com')) {
    throw new Error(`hosts api payload is invalid: ${hostsApi.text}`);
  }

  const api = await request(`${base}/secret-test/api/user/demo-user?key=test-key`);
  if (api.status !== 200) throw new Error(`api failed: ${api.status} ${api.text}`);
  const apiJson = JSON.parse(api.text);
  if (!apiJson.success || apiJson.obj.links.length !== 4) throw new Error('api payload is invalid');
  const vlessFromApi = apiJson.obj.links.find((item) => item.protocol === 'VLESS')?.url || '';
  if (!vlessFromApi.includes('allowInsecure=0&ech=A%2BB%2FC%3D&type=ws')) {
    throw new Error(`VLESS ECH was not injected in API response: ${vlessFromApi}`);
  }
  const expandedHosts = apiJson.obj.links.map((item) => item.url).join('\n');
  if (!expandedHosts.includes('vless://mock-config-two@alt1.example.com:443') || !expandedHosts.includes('vless://mock-config-two@alt2.example.com:443')) {
    throw new Error(`VLESS host expansion failed: ${expandedHosts}`);
  }

  const serializedClient = JSON.stringify(apiJson.obj.client);
  for (const secret of [client.uuid, client.password, client.auth, client.subId]) {
    if (serializedClient.includes(secret)) {
      throw new Error(`sensitive client field leaked in API response: ${secret}`);
    }
  }

  const sub = await request(`${base}/secret-test/sub/demo-user?key=test-key`);
  if (sub.status !== 200) throw new Error(`sub failed: ${sub.status}`);
  const decoded = Buffer.from(sub.text, 'base64').toString('utf8');
  if (!decoded.includes('vmess://mock-config-one') || !decoded.includes('vless://mock-config-two')) {
    throw new Error('subscription body is invalid');
  }
  if (!decoded.includes('ech=A%2BB%2FC%3D') || !decoded.includes('@alt1.example.com:443')) {
    throw new Error(`subscription body does not include encoded ECH and expanded hosts: ${decoded}`);
  }

  await fs.writeFile(echFilePath, 'NEW+ECH=\n');

  const saveHosts = await request(`${base}/secret-test/private-hosts-api?key=test-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'new-host.example.com\n# ignored\nhttps://ignored.example.com\nnew-host.example.com\n' })
  });
  if (saveHosts.status !== 200) throw new Error(`hosts save failed: ${saveHosts.status} ${saveHosts.text}`);
  const savedHostsJson = JSON.parse(saveHosts.text);
  if (savedHostsJson.obj.hosts.length !== 1 || savedHostsJson.obj.hosts[0] !== 'new-host.example.com') {
    throw new Error(`hosts save did not normalize content: ${saveHosts.text}`);
  }

  const raw = await request(`${base}/secret-test/sub/demo-user?format=raw&key=test-key`);
  if (raw.status !== 200 || !raw.text.includes('\n')) throw new Error('raw subscription failed');
  if (!raw.text.includes('ech=NEW%2BECH%3D') || !raw.text.includes('@new-host.example.com:443')) {
    throw new Error(`raw subscription did not use updated ECH/hosts files: ${raw.text}`);
  }

  const qr = await request(`${base}/secret-test/qr?text=${encodeURIComponent('hello')}&key=test-key`);
  if (qr.status !== 200 || !qr.text.includes('<svg')) throw new Error('qr failed');

  console.log('Smoke test passed. Routes, secret path, custom hosts API path, access key, panel proxy, host editor, subscription expansion, QR, ECH injection, and sensitive-field masking are OK.');
} finally {
  child.kill('SIGTERM');
  panel.close();
  setTimeout(() => process.exit(0), 100);
}
