const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const pathParts = location.pathname.split('/').filter(Boolean);
const uIndex = pathParts.lastIndexOf('u');
const appBasePath = uIndex > 0 ? `/${pathParts.slice(0, uIndex).join('/')}` : '';
const email = decodeURIComponent(uIndex >= 0 ? pathParts.slice(uIndex + 1).join('/') : pathParts.at(-1) || '');
const key = params.get('key');
const keyQuery = key ? `?key=${encodeURIComponent(key)}` : '';

const withBase = (pathname) => `${appBasePath}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
const hostsPageLink = document.querySelector('#hostsPageLink');
if (hostsPageLink) hostsPageLink.href = `${withBase('/hosts')}${keyQuery}`;

const formatBytes = (bytes = 0) => {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** idx).toFixed(idx ? 2 : 0)} ${units[idx]}`;
};

const formatTime = (ms) => {
  const value = Number(ms || 0);
  if (!value) return 'نامحدود / ثبت‌نشده';
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(ms);
  }
};

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  toast('در کلیپ‌بورد کپی شد');
}

function detailRow(label, value) {
  return `<div class="detail-row"><span>${label}</span><strong>${value ?? '-'}</strong></div>`;
}

function renderDetails(data) {
  const c = data.client;
  const rows = [
    ['سقف ترافیک', c.totalGB ? formatBytes(c.totalGB) : 'نامحدود / ثبت‌نشده'],
    ['ترافیک مصرف‌شده', formatBytes(data.usedTraffic)],
    ['تاریخ انقضا', formatTime(c.expiryTime)],
    ['وضعیت سرویس', c.enable ? 'فعال' : 'غیرفعال'],
    ['زمان ایجاد', formatTime(c.createdAt)],
    ['آخرین بروزرسانی', formatTime(c.updatedAt)]
  ];
  $('#details').innerHTML = rows.map(([k, v]) => detailRow(k, v)).join('');
}

function renderConfigs(links) {
  $('#configCount').textContent = `${links.length} کانفیگ فعال`;
  $('#configs').innerHTML = links.map((item) => `
    <article class="config-item">
      <div class="config-meta">
        <span class="protocol">${item.protocol}</span>
        <strong>${item.name}</strong>
      </div>
      <code>${item.url}</code>
      <div class="button-row">
        <button class="small" data-copy-text="${encodeURIComponent(item.url)}">کپی</button>
        <a class="button small ghost" href="${item.url}">باز کردن در کلاینت</a>
      </div>
    </article>
  `).join('');
}

async function init() {
  try {
    const response = await fetch(withBase(`/api/user/${encodeURIComponent(email)}${keyQuery}`), { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.msg || 'دریافت اطلاعات سرویس با خطا مواجه شد');

    const data = payload.obj;
    $('#statusPill').textContent = data.client.enable ? 'فعال' : 'غیرفعال';
    $('#statusPill').classList.toggle('danger', !data.client.enable);
    $('#title').textContent = `اشتراک کاربر ${data.client.email}`;
    $('#summary').textContent = `${data.links.length} کانفیگ فعال یافت شد. مصرف فعلی: ${formatBytes(data.usedTraffic)} از ${data.client.totalGB ? formatBytes(data.client.totalGB) : 'نامحدود'}`;

    $('#subscriptionUrl').value = data.subscriptionUrl;
    $('#openSub').href = data.subscriptionUrl;
    $('#openRawSub').href = data.rawSubscriptionUrl;
    $('#subQr').src = withBase(`/qr?text=${encodeURIComponent(data.subscriptionUrl)}${key ? `&key=${encodeURIComponent(key)}` : ''}`);
    $('#copyAll').addEventListener('click', () => copyText(data.links.map((item) => item.url).join('\n')));

    renderConfigs(data.links);
    renderDetails(data);
    $('#actions').classList.remove('hidden');
    $('#configsCard').classList.remove('hidden');
    $('#detailsCard').classList.remove('hidden');

    document.addEventListener('click', (event) => {
      const copySelector = event.target.closest('[data-copy]')?.getAttribute('data-copy');
      if (copySelector) return copyText($(copySelector).value);

      const encoded = event.target.closest('[data-copy-text]')?.getAttribute('data-copy-text');
      if (encoded) return copyText(decodeURIComponent(encoded));
    });
  } catch (err) {
    $('#statusPill').textContent = 'خطا';
    $('#statusPill').classList.add('danger');
    $('#summary').textContent = err.message || 'در حال حاضر امکان نمایش اطلاعات وجود ندارد.';
  }
}

init();
