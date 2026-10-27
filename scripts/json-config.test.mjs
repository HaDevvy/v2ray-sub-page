import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFileXrayJson } from '../xray-json.js';

const sourcePath = new URL('../templates/extra-xray-config.json', import.meta.url);
const original = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const initialEch = original.outbounds[0].streamSettings.tlsSettings.echConfigList;
const updatedEch = 'AEX+DQBBnQAgACAuUyG3EwlOlnDr5/s2GM04Ruokm4DKWz+ouys2fCitRwAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=';

test('one complete standalone file config is returned; all content except echConfigList stays identical', async () => {
  const result = await buildFileXrayJson(sourcePath, updatedEch);
  const source = structuredClone(original);
  source.outbounds[0].streamSettings.tlsSettings.echConfigList = updatedEch;
  assert.deepEqual(result, source);
  assert.notEqual(initialEch, updatedEch);
  const proxy = result.outbounds[0];
  assert.equal(proxy.settings.id, '0dc5e0b4-a011-473e-8a8e-dc9d26bf044c');
  assert.equal(proxy.settings.address, 'market.dgetebar.ir');
  assert.equal(proxy.settings.port, 2083);
  assert.equal(proxy.streamSettings.tlsSettings.serverName, 'se.multi7.xyz');
  assert.deepEqual(proxy.streamSettings.tlsSettings.curvePreferences, ['X25519']);
  assert.equal(proxy.streamSettings.tlsSettings.fingerprint, 'unsafe');
  assert.equal(proxy.streamSettings.tlsSettings.echForceQuery, 'full');
  assert.equal(proxy.streamSettings.xhttpSettings.mode, 'packet-up');
  assert.equal(result.dns.servers.length, 5);
  assert.equal(result.routing.rules.length, 10);
  assert.equal(result.routing.rules[8].outboundTag, 'direct');
  assert.equal(result.routing.rules[9].outboundTag, 'proxy');
});

test('file is read fresh for every request (including changed fields outside ECH)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extra-xray-'));
  try {
    const file = path.join(dir, 'extra-xray.json');
    await fs.writeFile(file, JSON.stringify(original));
    const a = await buildFileXrayJson(file, updatedEch);
    assert.equal(a.outbounds[0].settings.port, 2083);
    const changed = structuredClone(original);
    changed.outbounds[0].settings.port = 8443;
    await fs.writeFile(file, JSON.stringify(changed));
    const b = await buildFileXrayJson(file, updatedEch);
    assert.equal(b.outbounds[0].settings.port, 8443);
    assert.equal(original.outbounds[0].settings.port, 2083);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('does not silently serve the stale ECH embedded in the file', async () => {
  await assert.rejects(buildFileXrayJson(sourcePath, ''), { status: 503 });
  await assert.rejects(buildFileXrayJson(new URL('./missing.json', import.meta.url), updatedEch), { status: 503 });
});

test('rejects templates without mandatory TLS keys', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extra-xray-'));
  try {
    const file = path.join(dir, 'broken.json');
    const broken = structuredClone(original);
    delete broken.outbounds[0].streamSettings.tlsSettings.echForceQuery;
    await fs.writeFile(file, JSON.stringify(broken));
    await assert.rejects(buildFileXrayJson(file, updatedEch), { status: 500, message: /echForceQuery/ });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
