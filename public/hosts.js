const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const key = params.get('key');
const initialTargetHost = params.get('host') || '';
const hostsApiPath = window.__HOSTS_API_PATH__ || '/hosts-secret/api';
const appBasePath = window.__APP_BASE_PATH__ || '';

function normalizeHostValue(value = '') {
  return String(value).trim().toLowerCase().replace(/\.+$/, '');
}

function currentTargetHost() {
  return normalizeHostValue($('#targetHost').value);
}

function hostsApiUrl() {
  const url = new URL(hostsApiPath, location.origin);
  const targetHost = currentTargetHost();
  if (targetHost) url.searchParams.set('host', targetHost);
  if (key) url.searchParams.set('key', key);
  return `${url.pathname}${url.search}`;
}

function syncPageUrl(targetHost) {
  const query = new URLSearchParams(location.search);
  if (targetHost) query.set('host', targetHost);
  else query.delete('host');
  if (key) query.set('key', key);
  const qs = query.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function render(data) {
  const text = data.text || '';
  const hosts = Array.isArray(data.hosts) ? data.hosts : [];
  const targetHost = data.targetHost || currentTargetHost();
  $('#targetHost').value = targetHost;
  $('#hostsText').value = text;
  $('#hostsPreview').textContent = text || 'فایل این host خالی است.';
  $('#fileHint').textContent = targetHost ? `فایل مخصوص ${targetHost}` : 'ابتدا host اصلی را وارد کنید.';
  $('#hostCount').textContent = `${hosts.length} هاست جایگزین`;
  $('#statusPill').textContent = 'آماده';
  $('#statusPill').classList.remove('danger');
  syncPageUrl(targetHost);
}

function requireTargetHost() {
  const targetHost = currentTargetHost();
  if (!targetHost) {
    $('#statusPill').textContent = 'host لازم است';
    $('#statusPill').classList.add('danger');
    $('#hostsPreview').textContent = 'برای خواندن یا ذخیره، اول host اصلی را وارد کنید؛ مثل market.hqmq.com';
    return '';
  }
  return targetHost;
}

async function loadHosts() {
  try {
    const targetHost = requireTargetHost();
    if (!targetHost) return;
    $('#statusPill').textContent = 'در حال خواندن فایل';
    const response = await fetch(hostsApiUrl(), { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.msg || 'خواندن فایل hosts با خطا مواجه شد');
    render(payload.obj);
  } catch (err) {
    $('#statusPill').textContent = 'خطا';
    $('#statusPill').classList.add('danger');
    $('#hostsPreview').textContent = err.message || 'خطای نامشخص';
  }
}

async function saveHosts(event) {
  event.preventDefault();
  try {
    const targetHost = requireTargetHost();
    if (!targetHost) return;
    $('#statusPill').textContent = 'در حال ذخیره';
    const response = await fetch(hostsApiUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: $('#hostsText').value })
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.msg || 'ذخیره فایل hosts با خطا مواجه شد');
    render(payload.obj);
    toast(`هاست‌های جایگزین ${payload.obj.targetHost} ذخیره شدند`);
  } catch (err) {
    $('#statusPill').textContent = 'خطا';
    $('#statusPill').classList.add('danger');
    toast(err.message || 'ذخیره انجام نشد');
  }
}

$('#homeLink').href = `${appBasePath || '/'}${key ? `?key=${encodeURIComponent(key)}` : ''}`;
$('#targetHost').value = initialTargetHost;
$('#hostsForm').addEventListener('submit', saveHosts);
$('#reloadHosts').addEventListener('click', loadHosts);
$('#loadTargetHost').addEventListener('click', loadHosts);
$('#targetHost').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadHosts();
  }
});

if (initialTargetHost) {
  loadHosts();
} else {
  requireTargetHost();
}
