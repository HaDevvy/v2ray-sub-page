import fs from 'node:fs/promises';

// Read the administrator's full Xray configuration from disk on every request.
// It is a custom profile, not a link generated from the panel's subLinks.
export async function buildFileXrayJson(jsonFilePath, latestEch) {
  let source;
  try {
    source = JSON.parse(await fs.readFile(jsonFilePath, 'utf8'));
  } catch (err) {
    const error = new Error(`Cannot load the custom Xray JSON file: ${err.message}`);
    error.status = err.code === 'ENOENT' ? 503 : 500;
    throw error;
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    const error = new Error('The custom Xray JSON must be a JSON object.');
    error.status = 500;
    throw error;
  }
  if (!Array.isArray(source.inbounds) || !Array.isArray(source.outbounds) || !source.dns || !source.routing) {
    const error = new Error('The custom Xray JSON must include inbounds, outbounds, dns and routing.');
    error.status = 500;
    throw error;
  }
  const proxies = source.outbounds.filter((outbound) => outbound.tag === 'proxy' && outbound.protocol === 'vless');
  if (proxies.length !== 1) {
    const error = new Error('The custom Xray JSON must have exactly one proxy VLESS outbound.');
    error.status = 500;
    throw error;
  }
  const proxy = proxies[0];
  const tls = proxy.streamSettings?.tlsSettings;
  for (const key of ['echConfigList', 'curvePreferences', 'fingerprint', 'echForceQuery']) {
    if (tls?.[key] === undefined || tls[key] === null || tls[key] === '') {
      const error = new Error(`The custom Xray JSON must have tlsSettings.${key}.`);
      error.status = 500;
      throw error;
    }
  }
  if (!Array.isArray(tls.curvePreferences) || tls.curvePreferences.length === 0) {
    const error = new Error('tlsSettings.curvePreferences must be a nonempty array.');
    error.status = 500;
    throw error;
  }
  if (typeof latestEch !== 'string' || !latestEch.trim()) {
    const error = new Error('ECH updater file has no value; cannot return an up-to-date custom JSON config.');
    error.status = 503;
    throw error;
  }

  // Older Xray cores and many custom-config clients require VLESS vnext/users.
  // The source file is left untouched. Move (do not discard) the same connection
  // fields to the conventional Xray structure; keep every other JSON field.
  const settings = proxy.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    const error = new Error('Custom VLESS outbound settings must be an object.');
    error.status = 500;
    throw error;
  }
  if (!Array.isArray(settings.vnext)) {
    const { address, port, ...originalUserAndExtras } = settings;
    const { id, encryption, email, flow, level, ...extras } = originalUserAndExtras;
    if (typeof address !== 'string' || !address.trim() || !Number.isInteger(port) || port < 1 || port > 65535
      || typeof id !== 'string' || !id.trim() || typeof encryption !== 'string' || !encryption.trim()) {
      const error = new Error('Custom VLESS connection needs address, numeric port, id and encryption.');
      error.status = 500;
      throw error;
    }
    const user = { id, encryption };
    if (email !== undefined) user.email = email;
    if (flow !== undefined) user.flow = flow;
    if (level !== undefined) user.level = level;
    // Keep advanced VLESS settings at the settings level rather than silently dropping them.
    proxy.settings = { ...extras, vnext: [{ address, port, users: [user] }] };
  } else if (!settings.vnext.length || !settings.vnext[0]?.users?.length) {
    const error = new Error('Custom VLESS vnext/users must not be empty.');
    error.status = 500;
    throw error;
  }
  tls.echConfigList = latestEch.trim();
  return source;
}

// JSON *collection* for the portal's integrations; not a native v2rayN
// subscription format. Only one item has type "custom" and contains the
// entire Xray config as an object, not a link pretending to be a JSON profile.
export function buildJsonConfigCollection(links, xrayConfig) {
  return {
    format: 'v2-sub-page/custom-json-v1',
    configs: [
      ...links.map(({ name, protocol, url }) => ({ type: 'link', name, protocol, url })),
      { type: 'custom', name: 'Custom Xray (ECH)', format: 'json', config: xrayConfig }
    ]
  };
}
