import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFileXrayJson, buildJsonConfigCollection } from '../xray-json.js';

const sourcePath = new URL('../templates/extra-xray-config.json', import.meta.url);
const original = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const currentEch = 'AEX+DQBBnQAgACAuUyG3EwlOlnDr5/s2GM04Ruokm4DKWz+ouys2fCitRwAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=';
const proxyOf = (config) => config.outbounds.find((outbound) => outbound.tag === 'proxy');
const firstTargetOf = (config) => proxyOf(config).settings.vnext[0];

function expectOriginalPreserved(config, expectedEch = currentEch) {
  // Verify *every* original field except the deliberately converted VLESS
  // settings structure and the file-updated ECH is unchanged.
  const expected = structuredClone(original);
  expected.outbounds[0].streamSettings.tlsSettings.echConfigList = expectedEch;
  const { address, port, id, encryption, email, ...extra } = expected.outbounds[0].settings;
  expected.outbounds[0].settings = { ...extra, vnext: [{ address, port, users: [{ id, encryption, email }] }] };
  assert.deepEqual(config, expected);
}

test('the full administrator JSON is a real custom Xray profile with conventional VLESS vnext/users', async () => {
  const result = await buildFileXrayJson(sourcePath, currentEch);
  expectOriginalPreserved(result);
  assert.equal(firstTargetOf(result).address, 'market.dgetebar.ir');
  assert.equal(firstTargetOf(result).port, 2083);
  assert.equal(firstTargetOf(result).users[0].id, '0dc5e0b4-a011-473e-8a8e-dc9d26bf044c');
  assert.equal(firstTargetOf(result).users[0].email, 't@t.tt');
  assert.equal(proxyOf(result).streamSettings.tlsSettings.echConfigList, currentEch);
  assert.deepEqual(proxyOf(result).streamSettings.tlsSettings.curvePreferences, ['X25519']);
  assert.equal(proxyOf(result).streamSettings.tlsSettings.fingerprint, 'unsafe');
  assert.equal(proxyOf(result).streamSettings.tlsSettings.echForceQuery, 'full');
  assert.equal(proxyOf(result).streamSettings.xhttpSettings.mode, 'packet-up');
  assert.equal(result.dns.servers.length, 5);
  assert.equal(result.routing.rules.length, 10);
  assert.deepEqual(Object.keys(result).sort(), Object.keys(original).sort());
});

test('JSON collection keeps previous links and appends exactly one full custom JSON object', async () => {
  const config = await buildFileXrayJson(sourcePath, 'FRESH=');
  const oldLinks = [
    { name: 'first', protocol: 'VLESS', url: 'vless://x@example.com' },
    { name: 'second', protocol: 'VMess', url: 'vmess://base64' }
  ];
  const result = buildJsonConfigCollection(oldLinks, config);
  assert.equal(result.configs.length, 3);
  assert.deepEqual(result.configs.slice(0, 2), [
    { type: 'link', name: 'first', protocol: 'VLESS', url: 'vless://x@example.com' },
    { type: 'link', name: 'second', protocol: 'VMess', url: 'vmess://base64' }
  ]);
  assert.equal(result.configs.filter((item) => item.type === 'custom').length, 1);
  assert.equal(result.configs[2].format, 'json');
  assert.deepEqual(result.configs[2].config, config);
  assert.equal(result.configs[2].config.outbounds[0].streamSettings.tlsSettings.echConfigList, 'FRESH=');
  assert.equal(buildJsonConfigCollection([], config).configs.length, 1);
  assert.equal(original.outbounds[0].settings.address, 'market.dgetebar.ir');
});

test('custom profile is reread from the file for every request', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extra-xray-'));
  try {
    const file = path.join(dir, 'extra-xray.json');
    await fs.writeFile(file, JSON.stringify(original));
    const a = await buildFileXrayJson(file, 'ECH-ONE');
    assert.equal(firstTargetOf(a).port, 2083);
    const changed = structuredClone(original);
    changed.outbounds[0].settings.port = 8443;
    await fs.writeFile(file, JSON.stringify(changed));
    const b = await buildFileXrayJson(file, 'ECH-TWO');
    assert.equal(firstTargetOf(b).port, 8443);
    assert.equal(proxyOf(b).streamSettings.tlsSettings.echConfigList, 'ECH-TWO');
    assert.equal(original.outbounds[0].settings.port, 2083);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('rejects missing or empty ECH rather than returning a stale value', async () => {
  await assert.rejects(buildFileXrayJson(sourcePath, ''), { status: 503 });
  await assert.rejects(buildFileXrayJson(new URL('./missing.json', import.meta.url), currentEch), { status: 503 });
});

test('rejects incomplete TLS, DNS and routing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extra-xray-'));
  try {
    const file = path.join(dir, 'broken.json');
    const broken = structuredClone(original);
    delete broken.outbounds[0].streamSettings.tlsSettings.echForceQuery;
    await fs.writeFile(file, JSON.stringify(broken));
    await assert.rejects(buildFileXrayJson(file, currentEch), { status: 500, message: /echForceQuery/ });
    delete broken.routing;
    await fs.writeFile(file, JSON.stringify(broken));
    await assert.rejects(buildFileXrayJson(file, currentEch), { status: 500, message: /routing/ });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('already-conventional VLESS settings are not rewritten', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extra-xray-'));
  try {
    const file = path.join(dir, 'already-standard.json');
    const profile = structuredClone(original);
    profile.outbounds[0].settings = { vnext: [{ address: 'example.com', port: 1234, users: [{ id: 'mock-id', encryption: 'none' }] }] };
    await fs.writeFile(file, JSON.stringify(profile));
    const result = await buildFileXrayJson(file, 'ECH-NEW');
    assert.deepEqual(result.outbounds[0].settings, profile.outbounds[0].settings);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
