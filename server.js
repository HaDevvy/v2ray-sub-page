import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PANEL_BASE_URL = (process.env.PANEL_BASE_URL || '').replace(/\/+$/, '');
const PANEL_API_TOKEN = process.env.PANEL_API_TOKEN || '';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const ACCESS_KEY = process.env.ACCESS_KEY || '';
const ECH_FILE_PATH = process.env.ECH_FILE_PATH
  ? path.resolve(__dirname, process.env.ECH_FILE_PATH)
  : path.join(__dirname, 'ech-updater-data', 'last_ech.txt');
const APP_CONFIG_PATH_VALUE = process.env.APP_CONFIG_PATH || process.env.CONFIG_PATH || process.env.ECH_CONFIG_PATH;
const APP_CONFIG_PATH = APP_CONFIG_PATH_VALUE
  ? path.resolve(__dirname, APP_CONFIG_PATH_VALUE)
  : path.join(__dirname, 'config', 'config.json');
const HOSTS_DIR_PATH = process.env.HOSTS_DIR_PATH
  ? path.resolve(__dirname, process.env.HOSTS_DIR_PATH)
  : path.join(__dirname, 'data', 'hosts');
const HOST_SECRET_PATH = normalizeRoutePath(process.env.HOST_SECRET_PATH, '/hosts-secret', 'HOST_SECRET_PATH');
const HOSTS_PAGE_PATH = joinRoutePaths(HOST_SECRET_PATH, '/hosts');
const HOSTS_API_PATH = joinRoutePaths(HOST_SECRET_PATH, '/api');
const HOSTS_ADMIN_KEY = process.env.HOSTS_ADMIN_KEY || process.env.ADMIN_KEY || ACCESS_KEY;

function normalizeRoutePath(value, fallback, label = 'ROUTE_PATH') {
  if (!value) return fallback;
  const clean = String(value).trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return fallback;

  const routePath = `/${clean}`;
  if (!/^\/[A-Za-z0-9/_-]+$/.test(routePath)) {
    console.warn(`[config] ${label}=${JSON.stringify(value)} is invalid. Falling back to ${fallback}`);
    return fallback;
  }

  return routePath;
}

function joinRoutePaths(prefix, suffix) {
  const left = String(prefix || '').replace(/\/+$/, '');
  const right = String(suffix || '').replace(/^\/+/, '');
  return `${left}/${right}` || '/';
}

function normalizeSecretPath(value) {
  if (!value) return '';
  const clean = String(value).trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return clean ? `/${clean}` : '';
}

const SECRET_PATH = normalizeSecretPath(process.env.SECRET_PATH);

if (!PANEL_BASE_URL || !PANEL_API_TOKEN) {
  console.warn('[config] PANEL_BASE_URL and PANEL_API_TOKEN should be set in .env');
}

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  })
);
app.use(express.json({ limit: '64kb' }));

const protocolLabels = {
  vmess: 'VMess',
  vless: 'VLESS',
  trojan: 'Trojan',
  ss: 'Shadowsocks',
  socks: 'SOCKS',
  hysteria: 'Hysteria',
  hysteria2: 'Hysteria2',
  tuic: 'TUIC',
  wireguard: 'WireGuard'
};

function authHeader() {
  const token = PANEL_API_TOKEN.trim();
  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
}

function requireAccessKey(req, res, next) {
  if (!ACCESS_KEY) return next();
  if (req.query.key === ACCESS_KEY || req.get('x-access-key') === ACCESS_KEY) return next();
  return res.status(401).json({ success: false, msg: 'Access key is required.' });
}

function requireHostsAdmin(req, res, next) {
  const adminKey = String(HOSTS_ADMIN_KEY || '').trim();
  if (!adminKey) {
    return res.status(403).json({
      success: false,
      msg: 'HOSTS_ADMIN_KEY or ACCESS_KEY must be set before the hosts manager can be used.'
    });
  }

  if (req.query.key === adminKey || req.query.adminKey === adminKey || req.get('x-access-key') === adminKey || req.get('x-admin-key') === adminKey) {
    return next();
  }

  return res.status(401).json({ success: false, msg: 'Admin access key is required.' });
}

function mask(value, visible = 6) {
  if (value === null || value === undefined || value === '') return value;
  const s = String(value);
  if (s.length <= visible * 2) return `${s.slice(0, 3)}…`;
  return `${s.slice(0, visible)}…${s.slice(-visible)}`;
}

function sanitizeClient(client = {}) {
  return {
    id: client.id,
    email: client.email,
    flow: client.flow || '',
    security: client.security || '',
    limitIp: client.limitIp,
    totalGB: client.totalGB,
    expiryTime: client.expiryTime,
    enable: client.enable,
    tgId: client.tgId,
    group: client.group || '',
    comment: client.comment || '',
    reset: client.reset,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    uuidMasked: mask(client.uuid),
    passwordMasked: mask(client.password),
    authMasked: mask(client.auth),
    subIdMasked: mask(client.subId)
  };
}

async function readLatestEch() {
  try {
    const content = await fs.readFile(ECH_FILE_PATH, 'utf8');
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#')) || '';
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn(`[ech] Cannot read ${ECH_FILE_PATH}: ${err.message}`);
    }
    return '';
  }
}

const echModeAliases = new Map([
  ['ech', 'ech'],
  ['on', 'ech'],
  ['with', 'ech'],
  ['with-ech', 'ech'],
  ['enable', 'ech'],
  ['enabled', 'ech'],
  ['true', 'ech'],
  ['1', 'ech'],
  ['off', 'off'],
  ['no', 'off'],
  ['none', 'off'],
  ['without', 'off'],
  ['without-ech', 'off'],
  ['no-ech', 'off'],
  ['disable', 'off'],
  ['disabled', 'off'],
  ['false', 'off'],
  ['0', 'off'],
  ['both', 'both'],
  ['all', 'both'],
  ['mixed', 'both']
]);

function normalizeEchMode(value, fallback = 'ech') {
  const key = String(value ?? '').trim().toLowerCase();
  return echModeAliases.get(key) || fallback;
}

function normalizePortValue(value) {
  if (value === null || value === undefined || value === '') return '';

  const text = String(value).trim();
  if (!/^\d{1,5}$/.test(text)) return '';

  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return '';

  return String(port);
}

function normalizeSniPolicyEntry(value) {
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return { mode: normalizeEchMode(value, 'ech'), port: '' };
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const hasMode = Object.prototype.hasOwnProperty.call(value, 'mode')
      || Object.prototype.hasOwnProperty.call(value, 'ech')
      || Object.prototype.hasOwnProperty.call(value, 'enabled');
    return {
      mode: hasMode ? normalizeEchMode(value.mode ?? value.ech ?? value.enabled, 'ech') : '',
      port: normalizePortValue(value.port ?? value.overridePort ?? value.replacePort ?? value.targetPort)
    };
  }

  return { mode: 'ech', port: '' };
}

function mergeSniPolicy(existing = {}, next = {}) {
  return {
    mode: next.mode || existing.mode || '',
    port: next.port || existing.port || ''
  };
}

function upsertSniPolicy(config, rawSni, policy) {
  const sniKey = String(rawSni || '').trim().toLowerCase().replace(/\.+$/, '');
  if (!sniKey) return;

  if (sniKey.startsWith('*.')) {
    const suffix = normalizeHostValue(sniKey.slice(2));
    if (!suffix) return;

    const existing = config.wildcard.find((item) => item.suffix === suffix);
    if (existing) {
      Object.assign(existing, mergeSniPolicy(existing, policy));
      return;
    }

    config.wildcard.push({ suffix, ...mergeSniPolicy({}, policy) });
    return;
  }

  const sni = normalizeHostValue(sniKey);
  if (!sni) return;

  config.exact.set(sni, mergeSniPolicy(config.exact.get(sni), policy));
}

function normalizeAppConfig(payload = {}) {
  const config = { defaultMode: 'ech', exact: new Map(), wildcard: [] };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return config;

  const vlessConfig = payload.vless && typeof payload.vless === 'object' && !Array.isArray(payload.vless)
    ? payload.vless
    : payload;

  config.defaultMode = normalizeEchMode(
    vlessConfig.defaultEchMode
      ?? vlessConfig.defaultMode
      ?? vlessConfig.default
      ?? vlessConfig.echMode
      ?? vlessConfig.mode,
    'ech'
  );

  const sniConfig = vlessConfig.sniPolicies && typeof vlessConfig.sniPolicies === 'object' && !Array.isArray(vlessConfig.sniPolicies)
    ? vlessConfig.sniPolicies
    : vlessConfig.sni && typeof vlessConfig.sni === 'object' && !Array.isArray(vlessConfig.sni)
      ? vlessConfig.sni
      : payload.vless
        ? {}
        : vlessConfig;

  const reservedSniKeys = new Set([
    'default',
    'defaultmode',
    'defaultechmode',
    'echmode',
    'mode',
    'vless',
    'sni',
    'snipolicies',
    'ports',
    'portoverrides'
  ]);

  Object.entries(sniConfig).forEach(([rawSni, rawPolicy]) => {
    if (reservedSniKeys.has(String(rawSni).toLowerCase())) return;
    upsertSniPolicy(config, rawSni, normalizeSniPolicyEntry(rawPolicy));
  });

  const portConfig = vlessConfig.ports && typeof vlessConfig.ports === 'object' && !Array.isArray(vlessConfig.ports)
    ? vlessConfig.ports
    : vlessConfig.portOverrides && typeof vlessConfig.portOverrides === 'object' && !Array.isArray(vlessConfig.portOverrides)
      ? vlessConfig.portOverrides
      : null;

  if (portConfig) {
    Object.entries(portConfig).forEach(([rawSni, rawPort]) => {
      const port = normalizePortValue(rawPort);
      if (port) upsertSniPolicy(config, rawSni, { port });
    });
  }

  return config;
}

async function readAppConfig() {
  try {
    const content = await fs.readFile(APP_CONFIG_PATH, 'utf8');
    return normalizeAppConfig(JSON.parse(content));
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn(`[config] Cannot read/parse ${APP_CONFIG_PATH}: ${err.message}. Falling back to default VLESS ECH mode: ech`);
    }
    return normalizeAppConfig();
  }
}

function sniPolicyForSni(appConfig, sniValue) {
  const sni = normalizeHostValue(sniValue);
  if (!sni) return { mode: appConfig.defaultMode, port: '' };

  const exactPolicy = appConfig.exact.get(sni);
  if (exactPolicy) return { mode: exactPolicy.mode || appConfig.defaultMode, port: exactPolicy.port || '' };

  const wildcardMatch = appConfig.wildcard.find(({ suffix }) => sni === suffix || sni.endsWith(`.${suffix}`));
  return { mode: wildcardMatch?.mode || appConfig.defaultMode, port: wildcardMatch?.port || '' };
}

function echModeForSni(appConfig, sniValue) {
  return sniPolicyForSni(appConfig, sniValue).mode;
}

function portOverrideForSni(appConfig, sniValue) {
  return sniPolicyForSni(appConfig, sniValue).port;
}


function normalizeHostValue(value = '') {
  const host = String(value).trim().toLowerCase().replace(/\.+$/, '');
  if (!host || host.length > 253) return '';
  if (/^https?:\/\//i.test(host) || /[\s/:?#@\\]/.test(host)) return '';
  if (!/^[a-z0-9.-]+$/.test(host)) return '';

  const labels = host.split('.');
  if (labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
    return '';
  }

  return host;
}

function normalizeHostsText(text = '') {
  const seen = new Set();
  const hosts = [];

  String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line || line.startsWith('#')) return;
      const host = normalizeHostValue(line);
      if (!host) return;
      if (seen.has(host)) return;
      seen.add(host);
      hosts.push(host);
    });

  return hosts.join('\n');
}

function hostsFromText(text = '') {
  const normalized = normalizeHostsText(text);
  return normalized ? normalized.split('\n') : [];
}

async function ensureWritableFileParent(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function targetHostFile(targetHostValue) {
  const targetHost = normalizeHostValue(targetHostValue);
  if (!targetHost) {
    const error = new Error('Valid host query parameter is required. Example: ?host=market.hqmq.com');
    error.status = 400;
    throw error;
  }

  return {
    targetHost,
    filePath: path.join(HOSTS_DIR_PATH, `${targetHost}.txt`)
  };
}

async function readHostsTextForHost(targetHostValue) {
  const { targetHost, filePath } = targetHostFile(targetHostValue);
  try {
    return { targetHost, text: normalizeHostsText(await fs.readFile(filePath, 'utf8')) };
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn(`[hosts] Cannot read ${filePath}: ${err.message}`);
    }
    return { targetHost, text: '' };
  }
}

async function readCustomHostsForSourceHost(sourceHostValue, cache = new Map()) {
  const sourceHost = normalizeHostValue(sourceHostValue);
  if (!sourceHost) return [];

  if (cache.has(sourceHost)) return cache.get(sourceHost);
  const { text } = await readHostsTextForHost(sourceHost);
  const hosts = hostsFromText(text).filter((host) => host !== sourceHost);
  cache.set(sourceHost, hosts);
  return hosts;
}

async function writeHostsTextForHost(targetHostValue, text) {
  const { targetHost, filePath } = targetHostFile(targetHostValue);
  const normalized = normalizeHostsText(text);
  await ensureWritableFileParent(filePath);
  await fs.writeFile(filePath, normalized ? `${normalized}\n` : '', 'utf8');
  return { targetHost, text: normalized };
}


function splitLinkParts(link) {
  const rawLink = String(link || '');
  const hashIndex = rawLink.indexOf('#');
  const beforeHash = hashIndex >= 0 ? rawLink.slice(0, hashIndex) : rawLink;
  const hash = hashIndex >= 0 ? rawLink.slice(hashIndex) : '';

  const queryIndex = beforeHash.indexOf('?');
  const base = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  return { base, query, hash };
}

function safeDecodeQueryComponent(value = '') {
  try {
    // Do not convert + to a space. VLESS ECH values are base64 and raw + is meaningful.
    return decodeURIComponent(String(value).replace(/%(?![0-9A-Fa-f]{2})/g, '%25'));
  } catch {
    return String(value);
  }
}

function queryPartKey(part = '') {
  const eqIndex = String(part).indexOf('=');
  const key = eqIndex >= 0 ? String(part).slice(0, eqIndex) : String(part);
  return safeDecodeQueryComponent(key).trim().toLowerCase();
}

function queryPartValue(part = '') {
  const eqIndex = String(part).indexOf('=');
  return eqIndex >= 0 ? String(part).slice(eqIndex + 1) : '';
}

function queryParts(query = '') {
  return String(query || '').split('&').filter((part) => part !== '');
}

function removeQueryParamsPreservingOrder(query, keys = []) {
  const keySet = new Set(keys.map((item) => String(item).toLowerCase()));
  return queryParts(query).filter((part) => !keySet.has(queryPartKey(part))).join('&');
}

function setQueryParamPreservingOrder(query, key, value, insertAfterKeys = []) {
  const keyLower = String(key).toLowerCase();
  const insertAfterSet = new Set(insertAfterKeys.map((item) => String(item).toLowerCase()));
  const parts = queryParts(query).filter((part) => queryPartKey(part) !== keyLower);

  const insertAfterIndex = parts.reduce((lastMatch, part, index) => (
    insertAfterSet.has(queryPartKey(part)) ? index : lastMatch
  ), -1);

  const nextParts = [...parts];
  nextParts.splice(insertAfterIndex + 1, 0, `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return nextParts.join('&');
}

function getQueryParamValue(query, keys = []) {
  const keySet = new Set(keys.map((item) => String(item).toLowerCase()));
  const foundPart = queryParts(query).find((part) => keySet.has(queryPartKey(part)));
  if (!foundPart) return '';
  return safeDecodeQueryComponent(queryPartValue(foundPart)).trim();
}

function getExistingEchValue(link) {
  const rawLink = String(link || '');
  if (protocolOf(rawLink) !== 'vless') return '';
  const { query } = splitLinkParts(rawLink);
  return getQueryParamValue(query, ['ech']);
}

function addEchToVlessLink(link, echValue) {
  const rawLink = String(link || '');
  const ech = String(echValue || '').trim();
  if (!ech || protocolOf(rawLink) !== 'vless') return normalizeExistingEchInVlessLink(rawLink);

  const { base, query, hash } = splitLinkParts(rawLink);
  const nextQuery = setQueryParamPreservingOrder(query, 'ech', ech, ['allowInsecure', 'insecure']);
  return `${base}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
}

function removeEchFromVlessLink(link) {
  const rawLink = String(link || '');
  if (protocolOf(rawLink) !== 'vless') return rawLink;

  const { base, query, hash } = splitLinkParts(rawLink);
  const nextQuery = removeQueryParamsPreservingOrder(query, ['ech']);
  return `${base}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
}

function normalizeExistingEchInVlessLink(link) {
  const rawLink = String(link || '');
  const existingEch = getExistingEchValue(rawLink);
  if (!existingEch) return rawLink;
  return addEchToVlessLink(rawLink, existingEch);
}

function encodeEchForV2Box(value = '') {
  const decoded = safeDecodeQueryComponent(value);
  return encodeURIComponent(decoded).replace(/%2B/gi, '%252B');
}

function makeV2BoxCompatibleVlessLink(link) {
  const rawLink = String(link || '');
  if (protocolOf(rawLink) !== 'vless') return rawLink;

  const { base, query, hash } = splitLinkParts(rawLink);
  const nextQuery = queryParts(query).map((part) => {
    if (queryPartKey(part) !== 'ech') return part;

    const eqIndex = part.indexOf('=');
    if (eqIndex < 0) return part;

    const key = part.slice(0, eqIndex);
    const value = part.slice(eqIndex + 1);
    return `${key}=${encodeEchForV2Box(value)}`;
  }).join('&');

  return `${base}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
}

function makeV2BoxCompatibleLinks(links = []) {
  return links.map((item) => ({
    ...item,
    url: makeV2BoxCompatibleVlessLink(item.url)
  }));
}

const subscriptionCompatAliases = new Map([
  ['v2box', 'v2box'],
  ['v2-box', 'v2box'],
  ['v2_box', 'v2box']
]);

function normalizeSubscriptionCompat(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return subscriptionCompatAliases.get(key) || '';
}

function linksForSubscriptionCompat(links = [], compat = '') {
  if (compat === 'v2box') return makeV2BoxCompatibleLinks(links);
  return links;
}

function vlessSni(link) {
  const rawLink = String(link || '');
  if (protocolOf(rawLink) !== 'vless') return '';

  const { query } = splitLinkParts(rawLink);
  return normalizeHostValue(getQueryParamValue(query, ['sni', 'servername', 'serverName'])) || vlessAuthorityHost(rawLink);
}

function withLinkNameSuffix(link, suffix) {
  const rawLink = String(link || '');
  const cleanSuffix = String(suffix || '').trim();
  if (!cleanSuffix) return rawLink;

  const { base, query, hash } = splitLinkParts(rawLink);
  const currentName = hash ? safeDecodeQueryComponent(hash.slice(1)).trim() : '';
  if (currentName.includes(cleanSuffix)) return rawLink;

  const nextName = currentName ? `${currentName} ${cleanSuffix}` : cleanSuffix;
  return `${base}${query ? `?${query}` : ''}#${encodeURIComponent(nextName)}`;
}

function uniqueLinks(links = []) {
  const seen = new Set();
  return links.filter((link) => {
    if (seen.has(link)) return false;
    seen.add(link);
    return true;
  });
}

function applyEchPolicyToVlessLink(link, latestEch, appConfig) {
  const rawLink = String(link || '');
  if (protocolOf(rawLink) !== 'vless') return [rawLink];

  const mode = echModeForSni(appConfig, vlessSni(rawLink));
  const withEch = addEchToVlessLink(rawLink, latestEch || getExistingEchValue(rawLink));
  const withoutEch = removeEchFromVlessLink(rawLink);

  if (mode === 'off') return [withoutEch];
  if (mode === 'both') {
    return uniqueLinks([withLinkNameSuffix(withEch, 'ECH'), withLinkNameSuffix(withoutEch, 'No ECH')]);
  }
  return [withEch];
}


function vlessAuthorityHost(link) {
  const rawLink = String(link || '');
  if (protocolOf(rawLink) !== 'vless') return '';

  const hashIndex = rawLink.indexOf('#');
  const beforeHash = hashIndex >= 0 ? rawLink.slice(0, hashIndex) : rawLink;
  const queryIndex = beforeHash.indexOf('?');
  const beforeQuery = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;

  const atIndex = beforeQuery.lastIndexOf('@');
  if (atIndex < 0) return '';

  const authorityAfterAt = beforeQuery.slice(atIndex + 1);
  const portSeparatorIndex = authorityAfterAt.lastIndexOf(':');
  if (portSeparatorIndex <= 0) return '';

  return normalizeHostValue(authorityAfterAt.slice(0, portSeparatorIndex));
}

function vlessLinkAuthorityParts(link) {
  const rawLink = String(link || '');
  if (protocolOf(rawLink) !== 'vless') return null;

  const hashIndex = rawLink.indexOf('#');
  const beforeHash = hashIndex >= 0 ? rawLink.slice(0, hashIndex) : rawLink;
  const hash = hashIndex >= 0 ? rawLink.slice(hashIndex) : '';

  const queryIndex = beforeHash.indexOf('?');
  const beforeQuery = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex) : '';

  const atIndex = beforeQuery.lastIndexOf('@');
  if (atIndex < 0) return null;

  const authorityAfterAt = beforeQuery.slice(atIndex + 1);
  const portSeparatorIndex = authorityAfterAt.lastIndexOf(':');
  if (portSeparatorIndex <= 0) return null;

  return {
    rawLink,
    prefix: beforeQuery.slice(0, atIndex + 1),
    hostPart: authorityAfterAt.slice(0, portSeparatorIndex),
    portPart: authorityAfterAt.slice(portSeparatorIndex + 1),
    query,
    hash
  };
}

function replaceVlessAuthorityHost(link, host) {
  const parts = vlessLinkAuthorityParts(link);
  const nextHost = String(host || '').trim();
  if (!parts || !nextHost) return String(link || '');

  return `${parts.prefix}${nextHost}:${parts.portPart}${parts.query}${parts.hash}`;
}

function replaceVlessAuthorityPort(link, port) {
  const parts = vlessLinkAuthorityParts(link);
  const nextPort = normalizePortValue(port);
  if (!parts || !nextPort) return String(link || '');

  return `${parts.prefix}${parts.hostPart}:${nextPort}${parts.query}${parts.hash}`;
}

function applyPortPolicyToVlessLink(link, appConfig) {
  const rawLink = String(link || '');
  if (protocolOf(rawLink) !== 'vless') return rawLink;

  const port = portOverrideForSni(appConfig, vlessSni(rawLink));
  return port ? replaceVlessAuthorityPort(rawLink, port) : rawLink;
}

function expandVlessLinkByHosts(link, hosts = []) {
  const rawLink = String(link || '');
  if (protocolOf(rawLink) !== 'vless') return [rawLink];
  return [rawLink, ...hosts.map((host) => replaceVlessAuthorityHost(rawLink, host))];
}


function protocolOf(link = '') {
  const match = String(link).match(/^([a-z0-9+.-]+):\/\//i);
  return match ? match[1].toLowerCase() : 'unknown';
}

function nameOf(link = '', index = 0) {
  try {
    const decoded = decodeURIComponent(String(link));
    const hash = decoded.split('#')[1];
    if (hash) return hash.trim() || `Config ${index + 1}`;
  } catch {}
  return `Config ${index + 1}`;
}

function normalizeClientResponse(payload) {
  if (!payload?.success || !payload?.obj?.client) {
    const msg = payload?.msg || 'Client not found or panel returned an unexpected response.';
    const error = new Error(msg);
    error.status = 404;
    throw error;
  }
  return payload.obj;
}

function publicUrl(pathname, query = {}) {
  const cleanPath = String(pathname || '/').startsWith('/') ? String(pathname || '/') : `/${pathname}`;
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });

  const qs = params.toString();
  return `${PUBLIC_BASE_URL}${SECRET_PATH}${cleanPath}${qs ? `?${qs}` : ''}`;
}

function appRoutePath(pathname = '/') {
  const cleanPath = String(pathname || '/').startsWith('/') ? String(pathname || '/') : `/${pathname}`;
  return `${SECRET_PATH}${cleanPath}` || '/';
}

async function sendHostsPage(req, res) {
  const template = await fs.readFile(path.join(__dirname, 'public', 'hosts.html'), 'utf8');
  const appBaseHref = `${SECRET_PATH || ''}/`;
  const boot = [
    `<base href=${JSON.stringify(appBaseHref)}>` ,
    '<script>',
    `window.__HOSTS_API_PATH__ = ${JSON.stringify(appRoutePath(HOSTS_API_PATH))};`,
    `window.__APP_BASE_PATH__ = ${JSON.stringify(SECRET_PATH || '')};`,
    '</script>'
  ].join('\n');

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(template.replace('<head>', `<head>\n  ${boot.replace(/\n/g, '\n  ')}`));
}

async function panelGet(pathname) {
  const url = `${PANEL_BASE_URL}${pathname}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: authHeader()
    }
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const error = new Error(`Panel returned non-JSON response with status ${response.status}.`);
    error.status = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(json?.msg || `Panel request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return json;
}

async function loadUser(email, options = {}) {
  const compat = normalizeSubscriptionCompat(options.compat);
  const safeEmail = encodeURIComponent(email);
  const clientPayload = await panelGet(`/panel/api/clients/get/${safeEmail}`);
  const obj = normalizeClientResponse(clientPayload);
  const client = obj.client;

  if (!client.subId) {
    const error = new Error('Client has no subId.');
    error.status = 404;
    throw error;
  }

  const subPayload = await panelGet(`/panel/api/clients/subLinks/${encodeURIComponent(client.subId)}`);
  const [latestEch, appConfig] = await Promise.all([readLatestEch(), readAppConfig()]);
  const rawLinks = Array.isArray(subPayload?.obj) ? subPayload.obj.filter(Boolean) : [];
  const sourceHostCache = new Map();
  const expandedUrlGroups = await Promise.all(rawLinks.map(async (rawUrl) => {
    const sniPolicyUrls = applyEchPolicyToVlessLink(rawUrl, latestEch, appConfig)
      .map((url) => applyPortPolicyToVlessLink(url, appConfig));
    const expandedGroups = await Promise.all(sniPolicyUrls.map(async (url) => {
      const sourceHost = vlessAuthorityHost(url);
      const customHosts = await readCustomHostsForSourceHost(sourceHost, sourceHostCache);
      return expandVlessLinkByHosts(url, customHosts);
    }));
    return expandedGroups.flat();
  }));
  const expandedUrls = expandedUrlGroups.flat();
  const normalLinks = expandedUrls.map((url, index) => ({
    index: index + 1,
    name: nameOf(url, index),
    protocol: protocolLabels[protocolOf(url)] || protocolOf(url).toUpperCase(),
    url
  }));
  const links = linksForSubscriptionCompat(normalLinks, compat).map((item, index) => ({
    ...item,
    index: index + 1,
    name: nameOf(item.url, index),
    protocol: protocolLabels[protocolOf(item.url)] || protocolOf(item.url).toUpperCase()
  }));

  const publicEmail = encodeURIComponent(email);
  const key = ACCESS_KEY || undefined;
  const subscriptionUrl = publicUrl(`/sub/${publicEmail}`, { key });
  const rawSubscriptionUrl = publicUrl(`/sub/${publicEmail}`, { format: 'raw', key });
  const v2boxSubscriptionUrl = publicUrl(`/sub/${publicEmail}`, { compat: 'v2box', key });
  const rawV2boxSubscriptionUrl = publicUrl(`/sub/${publicEmail}`, { compat: 'v2box', format: 'raw', key });
  const userPageUrl = publicUrl(`/u/${publicEmail}`, { key });
  const v2boxUserPageUrl = publicUrl(`/u/${publicEmail}`, { compat: 'v2box', key });

  return {
    client: sanitizeClient(client),
    inboundIds: obj.inboundIds || [],
    usedTraffic: obj.usedTraffic || 0,
    links,
    compat,
    isV2Box: compat === 'v2box',
    subscriptionUrl,
    rawSubscriptionUrl,
    v2boxSubscriptionUrl,
    rawV2boxSubscriptionUrl,
    userPageUrl,
    v2boxUserPageUrl,
    secretPath: SECRET_PATH,
    updatedAt: new Date().toISOString()
  };
}

function toSubscriptionBody(links, format = 'base64') {
  const plain = links.map((item) => item.url).join('\n');
  if (format === 'raw') return plain;
  return Buffer.from(plain, 'utf8').toString('base64');
}

// Keep healthcheck public for Docker/reverse proxies. It returns no sensitive data.
app.get('/healthz', (req, res) => {
  res.json({ ok: true, service: 'v2-sub-page' });
});

// When a secret path is configured, do not expose the root page.
app.get('/', (req, res, next) => {
  if (SECRET_PATH) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  return next();
});

// Redirect /secret to /secret/ so relative assets resolve correctly in browsers.
if (SECRET_PATH) {
  app.use((req, res, next) => {
    const requestPath = req.originalUrl.split('?')[0];
    if (requestPath === SECRET_PATH) {
      const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      return res.redirect(308, `${SECRET_PATH}/${query}`);
    }
    return next();
  });
}

const router = express.Router();

router.get([HOSTS_PAGE_PATH, joinRoutePaths(HOST_SECRET_PATH, '/hosts.html')], requireHostsAdmin, sendHostsPage);

router.use((req, res, next) => {
  if (['/hosts', '/hosts.html', '/hosts-env.js'].includes(req.path)) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  return next();
});

router.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

router.get('/u/:email', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

router.get(HOSTS_API_PATH, requireHostsAdmin, async (req, res) => {
  try {
    const { targetHost, text } = await readHostsTextForHost(req.query.host);
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      obj: { targetHost, text, hosts: hostsFromText(text), updatedAt: new Date().toISOString() }
    });
  } catch (err) {
    console.error(`[hosts-api:get:${HOSTS_API_PATH}]`, err);
    res.status(err.status || 500).json({ success: false, msg: err.message || 'Unexpected error.' });
  }
});

router.post(HOSTS_API_PATH, requireHostsAdmin, async (req, res) => {
  try {
    const targetHostValue = req.query.host ?? req.body?.host;
    const text = req.body?.text ?? req.body?.hosts ?? '';
    const { targetHost, text: normalized } = await writeHostsTextForHost(targetHostValue, text);
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      obj: { targetHost, text: normalized, hosts: hostsFromText(normalized), updatedAt: new Date().toISOString() }
    });
  } catch (err) {
    console.error(`[hosts-api:post:${HOSTS_API_PATH}]`, err);
    res.status(err.status || 500).json({ success: false, msg: err.message || 'Unexpected error.' });
  }
});

router.get('/api/user/:email', requireAccessKey, async (req, res) => {
  try {
    const compat = normalizeSubscriptionCompat(req.query.compat ?? req.query.client ?? req.query.app ?? req.query.target);
    const data = await loadUser(req.params.email, { compat });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, obj: data });
  } catch (err) {
    console.error('[api/user]', err);
    res.status(err.status || 500).json({ success: false, msg: err.message || 'Unexpected error.' });
  }
});

router.get('/sub/:email', requireAccessKey, async (req, res) => {
  try {
    const data = await loadUser(req.params.email);
    const format = req.query.format === 'raw' ? 'raw' : 'base64';
    const compat = normalizeSubscriptionCompat(req.query.compat ?? req.query.client ?? req.query.app ?? req.query.target);
    const links = linksForSubscriptionCompat(data.links, compat);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(toSubscriptionBody(links, format));
  } catch (err) {
    console.error('[sub]', err);
    res.status(err.status || 500).type('text/plain').send(err.message || 'Unexpected error.');
  }
});

router.get('/qr', requireAccessKey, async (req, res) => {
  const text = String(req.query.text || '');
  if (!text) return res.status(400).send('text is required');
  if (text.length > 4096) return res.status(413).send('text is too long');
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M'
    });
    res.set('Content-Type', 'image/svg+xml; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(svg);
  } catch (err) {
    res.status(500).send(err.message || 'Cannot generate QR');
  }
});

app.use(SECRET_PATH || '/', router);

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  const publicRoot = `${PUBLIC_BASE_URL}${SECRET_PATH || ''}/`;
  console.log(`Subscription portal is running on http://localhost:${PORT}`);
  console.log(`Public root: ${publicRoot}`);
  console.log(`Hosts page path: ${SECRET_PATH || ''}${HOSTS_PAGE_PATH}`);
  console.log(`Hosts API path: ${SECRET_PATH || ''}${HOSTS_API_PATH}`);
  console.log(`App config path: ${APP_CONFIG_PATH}`);
});
