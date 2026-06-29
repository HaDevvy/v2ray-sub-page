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
        'vless://mock-config-two@example.com:443?encryption=none&allowInsecure=0&sni=example.com&type=ws#Demo%20VLESS',
        'vless://mock-config-market@market.hqmq.com:443?encryption=none&allowInsecure=0&sni=market.hqmq.com&type=ws#Demo%20Market%20VLESS'
      ]
    }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ success: false, msg: 'not found' }));
});

const testDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'v2-sub-page-data-'));
const echFilePath = path.join(testDataDir, 'last_ech.txt');
const hostsDirPath = path.join(testDataDir, 'hosts');
const echConfigPath = path.join(testDataDir, 'ech-config.json');
await fs.mkdir(hostsDirPath, { recursive: true });
await fs.writeFile(echFilePath, 'A+B/C=\n');
await fs.writeFile(echConfigPath, JSON.stringify({
  default: 'ech',
  sni: {
    'example.com': 'both',
    'market.hqmq.com': 'off'
  }
}, null, 2));
await fs.writeFile(path.join(hostsDirPath, 'example.com.txt'), 'alt1.example.com\nalt2.example.com\n');
await fs.writeFile(path.join(hostsDirPath, 'market.hqmq.com.txt'), 'market-alt.example.com\n');

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
    ECH_CONFIG_PATH: echConfigPath,
    HOSTS_DIR_PATH: hostsDirPath,
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

  const v2boxPage = await request(`${base}/secret-test/v2box/demo-user?key=test-key`);
  if (v2boxPage.status !== 200 || !v2boxPage.text.includes('صفحه مخصوص V2Box')) {
    throw new Error(`V2Box user page failed: ${v2boxPage.status}`);
  }

  const hostsPage = await request(`${base}/secret-test/hosts?host=example.com&key=test-key`);
  if (hostsPage.status !== 200 || !hostsPage.text.includes('مدیریت هاست‌های جایگزین برای هر host اصلی')) {
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

  const missingHostApi = await request(`${base}/secret-test/private-hosts-api?key=test-key`);
  if (missingHostApi.status !== 400) {
    throw new Error(`hosts api should require host query parameter, got ${missingHostApi.status}`);
  }

  const hostsApi = await request(`${base}/secret-test/private-hosts-api?host=example.com&key=test-key`);
  if (hostsApi.status !== 200) throw new Error(`hosts api failed: ${hostsApi.status} ${hostsApi.text}`);
  const hostsJson = JSON.parse(hostsApi.text);
  if (!hostsJson.success || hostsJson.obj.targetHost !== 'example.com' || hostsJson.obj.hosts.length !== 2 || !hostsJson.obj.text.includes('alt1.example.com')) {
    throw new Error(`hosts api payload is invalid: ${hostsApi.text}`);
  }

  const marketHostsApi = await request(`${base}/secret-test/private-hosts-api?host=market.hqmq.com&key=test-key`);
  if (marketHostsApi.status !== 200 || !marketHostsApi.text.includes('market-alt.example.com')) {
    throw new Error(`market hosts api failed: ${marketHostsApi.status} ${marketHostsApi.text}`);
  }

  const api = await request(`${base}/secret-test/api/user/demo-user?key=test-key`);
  if (api.status !== 200) throw new Error(`api failed: ${api.status} ${api.text}`);
  const apiJson = JSON.parse(api.text);
  if (!apiJson.success || apiJson.obj.links.length !== 9) throw new Error(`api payload is invalid: expected 9 links, got ${apiJson.obj.links.length}`);
  if (!apiJson.obj.v2boxSubscriptionUrl.includes('compat=v2box') || !apiJson.obj.rawV2boxSubscriptionUrl.includes('compat=v2box') || !apiJson.obj.rawV2boxSubscriptionUrl.includes('format=raw')) {
    throw new Error(`V2Box subscription URLs are missing from API response: ${JSON.stringify(apiJson.obj)}`);
  }
  if (!apiJson.obj.v2boxUserPageUrl.includes('/v2box/demo-user') || !apiJson.obj.userPageUrl.includes('/u/demo-user')) {
    throw new Error(`V2Box/user page URLs are missing from API response: ${JSON.stringify(apiJson.obj)}`);
  }
  const allUrlsFromApi = apiJson.obj.links.map((item) => item.url).join('\n');
  const vlessFromApi = apiJson.obj.links.find((item) => item.protocol === 'VLESS' && item.url.includes('@example.com:443') && item.url.includes('ech='))?.url || '';
  if (!vlessFromApi.includes('allowInsecure=0&ech=A%2BB%2FC%3D&sni=example.com&type=ws')) {
    throw new Error(`VLESS ECH was not injected/encoded in API response: ${vlessFromApi}`);
  }
  if (!allUrlsFromApi.includes('mock-config-two@example.com:443?encryption=none&allowInsecure=0&sni=example.com&type=ws#Demo%20VLESS%20No%20ECH')) {
    throw new Error(`VLESS both-mode did not create a no-ECH variant: ${allUrlsFromApi}`);
  }
  if (/mock-config-market@[^\n]+ech=/.test(allUrlsFromApi)) {
    throw new Error(`VLESS off-mode did not remove ECH for market SNI: ${allUrlsFromApi}`);
  }
  const expandedHosts = allUrlsFromApi;
  if (!expandedHosts.includes('vless://mock-config-two@alt1.example.com:443') || !expandedHosts.includes('vless://mock-config-two@alt2.example.com:443')) {
    throw new Error(`VLESS example.com host expansion failed: ${expandedHosts}`);
  }
  if (!expandedHosts.includes('vless://mock-config-market@market-alt.example.com:443')) {
    throw new Error(`VLESS market.hqmq.com host expansion failed: ${expandedHosts}`);
  }
  if (expandedHosts.includes('vless://mock-config-market@alt1.example.com:443')) {
    throw new Error(`VLESS host expansion leaked between source hosts: ${expandedHosts}`);
  }

  const apiV2box = await request(`${base}/secret-test/api/user/demo-user?compat=v2box&key=test-key`);
  if (apiV2box.status !== 200) throw new Error(`api V2Box failed: ${apiV2box.status} ${apiV2box.text}`);
  const apiV2boxJson = JSON.parse(apiV2box.text);
  if (!apiV2boxJson.success || apiV2boxJson.obj.compat !== 'v2box' || !apiV2boxJson.obj.isV2Box) {
    throw new Error(`api V2Box payload did not mark v2box mode: ${apiV2box.text}`);
  }
  const allV2boxUrlsFromApi = apiV2boxJson.obj.links.map((item) => item.url).join('\n');
  if (!allV2boxUrlsFromApi.includes('ech=A%252BB%2FC%3D') || allV2boxUrlsFromApi.includes('ech=A%2BB%2FC%3D')) {
    throw new Error(`api V2Box links are not V2Box-compatible: ${allV2boxUrlsFromApi}`);
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
  if (!decoded.includes('ech=A%2BB%2FC%3D') || !decoded.includes('@alt1.example.com:443') || !decoded.includes('@market-alt.example.com:443')) {
    throw new Error(`subscription body does not include encoded ECH and per-source-host expanded hosts: ${decoded}`);
  }
  if (!decoded.includes('Demo%20VLESS%20ECH') || !decoded.includes('Demo%20VLESS%20No%20ECH')) {
    throw new Error(`subscription body does not include both ECH and no-ECH variants for example.com SNI: ${decoded}`);
  }
  if (/mock-config-market@[^\n]+ech=/.test(decoded)) {
    throw new Error(`subscription body should not include ECH for market.hqmq.com SNI: ${decoded}`);
  }

  const v2boxSub = await request(`${base}/secret-test/sub/demo-user?compat=v2box&key=test-key`);
  if (v2boxSub.status !== 200) throw new Error(`V2Box sub failed: ${v2boxSub.status}`);
  const decodedV2box = Buffer.from(v2boxSub.text, 'base64').toString('utf8');
  if (!decodedV2box.includes('ech=A%252BB%2FC%3D')) {
    throw new Error(`V2Box subscription did not double-encode plus signs inside ECH: ${decodedV2box}`);
  }
  if (decodedV2box.includes('ech=A%2BB%2FC%3D')) {
    throw new Error(`V2Box subscription still contains standard single-encoded plus signs inside ECH: ${decodedV2box}`);
  }
  if (!decoded.includes('ech=A%2BB%2FC%3D') || decoded.includes('ech=A%252BB%2FC%3D')) {
    throw new Error(`Normal subscription should keep standard ECH encoding: ${decoded}`);
  }

  await fs.writeFile(echFilePath, 'NEW+ECH=\n');

  const saveHosts = await request(`${base}/secret-test/private-hosts-api?host=example.com&key=test-key`, {
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
  if (!raw.text.includes('Demo%20VLESS%20ECH') || !raw.text.includes('Demo%20VLESS%20No%20ECH')) {
    throw new Error(`raw subscription did not keep both-mode variants after update: ${raw.text}`);
  }
  if (!raw.text.includes('@market-alt.example.com:443') || raw.text.includes('mock-config-market@new-host.example.com:443')) {
    throw new Error(`raw subscription did not keep per-source-host files isolated: ${raw.text}`);
  }
  if (/mock-config-market@[^\n]+ech=/.test(raw.text)) {
    throw new Error(`raw subscription should not include ECH for off-mode market SNI: ${raw.text}`);
  }

  const rawV2box = await request(`${base}/secret-test/sub/demo-user?format=raw&compat=v2box&key=test-key`);
  if (rawV2box.status !== 200 || !rawV2box.text.includes('ech=NEW%252BECH%3D')) {
    throw new Error(`raw V2Box subscription did not double-encode updated ECH plus signs: ${rawV2box.status} ${rawV2box.text}`);
  }
  if (!raw.text.includes('ech=NEW%2BECH%3D') || raw.text.includes('ech=NEW%252BECH%3D')) {
    throw new Error(`normal raw subscription should keep standard updated ECH encoding: ${raw.text}`);
  }

  const qr = await request(`${base}/secret-test/qr?text=${encodeURIComponent('hello')}&key=test-key`);
  if (qr.status !== 200 || !qr.text.includes('<svg')) throw new Error('qr failed');

  console.log('Smoke test passed. Routes, secret path, custom hosts API path, access key, panel proxy, per-source-host editor, subscription expansion, QR, per-SNI ECH policy, standard and V2Box-compatible ECH encoding, and sensitive-field masking are OK.');
} finally {
  child.kill('SIGTERM');
  panel.close();
  setTimeout(() => process.exit(0), 100);
}
