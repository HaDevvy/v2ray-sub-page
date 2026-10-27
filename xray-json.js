import fs from 'node:fs/promises';

// This is a standalone, full Xray JSON supplied by the administrator. It is
// intentionally NOT derived from any VLESS link returned by the remote panel.
// Only the TLS ECHConfigList value is replaced at request time.
export async function buildFileXrayJson(jsonFilePath, latestEch) {
  let source;
  try {
    source = JSON.parse(await fs.readFile(jsonFilePath, 'utf8'));
  } catch (err) {
    const error = new Error(`Cannot load the additional Xray JSON file: ${err.message}`);
    error.status = err.code === 'ENOENT' ? 503 : 500;
    throw error;
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    const error = new Error('The additional Xray JSON must be a JSON object.');
    error.status = 500;
    throw error;
  }
  if (!Array.isArray(source.outbounds)) {
    const error = new Error('The additional Xray JSON has no outbounds array.');
    error.status = 500;
    throw error;
  }
  const proxy = source.outbounds.find((outbound) => outbound.tag === 'proxy' && outbound.protocol === 'vless');
  const tls = proxy?.streamSettings?.tlsSettings;
  for (const key of ['echConfigList', 'curvePreferences', 'fingerprint', 'echForceQuery']) {
    if (tls?.[key] === undefined || tls[key] === null || tls[key] === '') {
      const error = new Error(`The additional Xray JSON must have tlsSettings.${key}.`);
      error.status = 500;
      throw error;
    }
  }
  if (!Array.isArray(tls.curvePreferences) || tls.curvePreferences.length === 0) {
    const error = new Error('tlsSettings.curvePreferences must be a nonempty array.');
    error.status = 500;
    throw error;
  }
  // Fail closed rather than silently returning an outdated ECH record from the template.
  if (typeof latestEch !== 'string' || !latestEch.trim()) {
    const error = new Error('ECH updater file has no value; cannot return an up-to-date JSON config.');
    error.status = 503;
    throw error;
  }
  tls.echConfigList = latestEch.trim();
  return source;
}
