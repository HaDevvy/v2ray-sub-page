// Best-effort live ECH discovery using HTTPS/SVCB (type 65) DNS records.
// A failed lookup never blocks the legacy file-driven ECH subscriptions.
const cache = new Map();
const pending = new Map();
const RETRY_MS = 60_000;
const DEFAULT_CACHE_MS = 300_000;
const MAX_CACHE_MS = 3_600_000;

export function parseEchFromHttpsAnswers(payload) {
  if (!payload || payload.Status !== 0 || !Array.isArray(payload.Answer)) return null;
  for (const answer of payload.Answer) {
    if (answer.type !== 65 || typeof answer.data !== 'string') continue;
    const match = answer.data.match(/(?:^|\s)ech=(?:"([a-zA-Z0-9+/=]+)"|([a-zA-Z0-9+/=]+))(?:\s|$)/);
    if (!match) continue;
    const raw = match[1] || match[2];
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length > 4096) continue;
    const decoded = Buffer.from(raw, 'base64');
    // ECHConfigList starts with a uint16 length in network byte order.
    if (decoded.length < 6 || decoded.readUInt16BE(0) !== decoded.length - 2) continue;
    const ttl = Number.isFinite(Number(answer.TTL)) ? Math.max(60, Number(answer.TTL)) : 300;
    return { value: raw, ttlMs: Math.min(MAX_CACHE_MS, ttl * 1000) };
  }
  return null;
}

export async function lookupLiveEch(serverName, { endpoint = 'https://cloudflare-dns.com/dns-query', fetchFn = fetch } = {}) {
  const name = String(serverName || '').trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(name) || name.includes('..')) return '';
  const cacheKey = `${endpoint}|${name}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending.has(cacheKey)) return pending.get(cacheKey);

  const job = (async () => {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:') throw new Error('ECH DoH endpoint must use HTTPS');
      url.searchParams.set('name', name);
      url.searchParams.set('type', 'HTTPS');
      const response = await fetchFn(url, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(2500)
      });
      if (!response.ok) throw new Error(`ECH DoH HTTP ${response.status}`);
      const record = parseEchFromHttpsAnswers(await response.json());
      const value = record?.value || '';
      cache.set(cacheKey, { value, expires: Date.now() + (record?.ttlMs || DEFAULT_CACHE_MS) });
      return value;
    } catch (err) {
      cache.set(cacheKey, { value: '', expires: Date.now() + RETRY_MS });
      console.warn(`[ech] DoH lookup failed for ${name}: ${err.message}`);
      return '';
    } finally {
      pending.delete(cacheKey);
    }
  })();
  pending.set(cacheKey, job);
  return job;
}
