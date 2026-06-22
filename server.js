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
  : path.join(__dirname, 'last_ech.txt');

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

function setQueryParamPreservingOrder(query, key, value, insertAfterKeys = []) {
  const params = new URLSearchParams(query || '');
  params.delete(key);

  const entries = Array.from(params.entries());
  const insertAfterIndex = entries.reduce((lastMatch, [entryKey], index) => (
    insertAfterKeys.includes(entryKey) ? index : lastMatch
  ), -1);

  const nextEntries = [...entries];
  nextEntries.splice(insertAfterIndex + 1, 0, [key, value]);

  const nextParams = new URLSearchParams();
  nextEntries.forEach(([entryKey, entryValue]) => nextParams.append(entryKey, entryValue));
  return nextParams.toString();
}

function addEchToVlessLink(link, echValue) {
  const rawLink = String(link || '');
  const ech = String(echValue || '').trim();
  if (!ech || protocolOf(rawLink) !== 'vless') return rawLink;

  const hashIndex = rawLink.indexOf('#');
  const beforeHash = hashIndex >= 0 ? rawLink.slice(0, hashIndex) : rawLink;
  const hash = hashIndex >= 0 ? rawLink.slice(hashIndex) : '';

  const queryIndex = beforeHash.indexOf('?');
  const base = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  const nextQuery = setQueryParamPreservingOrder(query, 'ech', ech, ['allowInsecure', 'insecure']);
  return `${base}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
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

async function loadUser(email) {
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
  const latestEch = await readLatestEch();
  const rawLinks = Array.isArray(subPayload?.obj) ? subPayload.obj.filter(Boolean) : [];
  const links = rawLinks.map((rawUrl, index) => {
    const url = addEchToVlessLink(rawUrl, latestEch);
    return {
      index: index + 1,
      name: nameOf(url, index),
      protocol: protocolLabels[protocolOf(url)] || protocolOf(url).toUpperCase(),
      url
    };
  });

  const publicEmail = encodeURIComponent(email);
  const key = ACCESS_KEY || undefined;
  const subscriptionUrl = publicUrl(`/sub/${publicEmail}`, { key });
  const rawSubscriptionUrl = publicUrl(`/sub/${publicEmail}`, { format: 'raw', key });

  return {
    client: sanitizeClient(client),
    inboundIds: obj.inboundIds || [],
    usedTraffic: obj.usedTraffic || 0,
    links,
    subscriptionUrl,
    rawSubscriptionUrl,
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
router.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

router.get('/u/:email', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

router.get('/api/user/:email', requireAccessKey, async (req, res) => {
  try {
    const data = await loadUser(req.params.email);
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
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(toSubscriptionBody(data.links, format));
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
});
