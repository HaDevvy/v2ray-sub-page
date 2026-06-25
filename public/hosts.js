const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const key = params.get('key');
const pathParts = location.pathname.split('/').filter(Boolean);
const hostsIndex = pathParts.lastIndexOf('hosts');
const appBasePath = hostsIndex > 0 ? `/${pathParts.slice(0, hostsIndex).join('/')}` : '';
const keyQuery = key ? `?key=${encodeURIComponent(key)}` : '';
const hostsApiPath = window.__HOSTS_API_PATH__ || '/api/hosts';
const withBase = (pathname) => `${appBasePath}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
const hostsApiUrl = () => `${withBase(hostsApiPath)}${keyQuery}`;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function render(data) {
  const text = data.text || '';
  const hosts = Array.isArray(data.hosts) ? data.hosts : [];
  $('#hostsText').value = text;
  $('#hostsPreview').textContent = text || 'فایل خالی است.';
  $('#hostCount').textContent = `${hosts.length} هاست`;
  $('#statusPill').textContent = 'آماده';
  $('#statusPill').classList.remove('danger');
}

async function loadHosts() {
  try {
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
    $('#statusPill').textContent = 'در حال ذخیره';
    const response = await fetch(hostsApiUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: $('#hostsText').value })
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.msg || 'ذخیره فایل hosts با خطا مواجه شد');
    render(payload.obj);
    toast('هاست‌ها در فایل txt ذخیره شدند');
  } catch (err) {
    $('#statusPill').textContent = 'خطا';
    $('#statusPill').classList.add('danger');
    toast(err.message || 'ذخیره انجام نشد');
  }
}

$('#homeLink').href = `${appBasePath || '.'}/${key ? `?key=${encodeURIComponent(key)}` : ''}`;
$('#hostsForm').addEventListener('submit', saveHosts);
$('#reloadHosts').addEventListener('click', loadHosts);
loadHosts();
