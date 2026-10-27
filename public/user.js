const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const pathParts = location.pathname.split('/').filter(Boolean);
const uIndex = pathParts.lastIndexOf('u');
const routeIndex = uIndex;
const appBasePath = routeIndex > 0 ? `/${pathParts.slice(0, routeIndex).join('/')}` : '';
const emailParts = routeIndex >= 0 ? pathParts.slice(routeIndex + 1) : [pathParts.at(-1) || ''];
const email = decodeURIComponent(emailParts.join('/'));
const key = params.get('key');
const compat = String(params.get('compat') || '').trim().toLowerCase();
const isV2BoxMode = ['v2box', 'v2-box', 'v2_box'].includes(compat);

const withBase = (pathname) => `${appBasePath}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;

function queryString(extra = {}) {
  const query = new URLSearchParams();
  if (key) query.set('key', key);
  Object.entries(extra).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(name, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

function absolutePortalUrl(pathname, extra = {}) {
  return `${location.origin}${withBase(pathname)}${queryString(extra)}`;
}


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
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

async function copyText(text) {
  await navigator.clipboard.writeText(String(text || ''));
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderConfigs(links, additionalConfigs = []) {
  const allConfigs = [...links, ...additionalConfigs];
  const suffix = isV2BoxMode ? ' مخصوص V2Box' : '';
  $('#configCount').textContent = `${allConfigs.length} کانفیگ فعال${suffix}`;
  const title = $('#configsTitle');
  if (title) title.textContent = isV2BoxMode ? 'کانفیگ‌های فعال مخصوص V2Box' : 'کانفیگ‌های فعال';
  $('#configs').innerHTML = allConfigs.map((item, index) => {
    const isCustom = item.type === 'custom';
    const url = escapeHtml(item.url);
    return `
      <article class="config-item">
        <div class="config-meta">
          <span class="protocol">${escapeHtml(item.protocol)}</span>
          <strong>${escapeHtml(item.name)}</strong>
        </div>
        <code>${url}</code>
        <div class="button-row">
          ${isCustom
            ? `<button class="small" data-json-copy-url="${url}">کپی JSON کامل</button>
               <button class="small ghost" data-json-preview-url="${url}" data-json-preview-target="custom-json-preview-${index}">نمایش کانفیگ کاستوم</button>
               <a class="button small ghost" href="${url}" download>دانلود JSON</a>`
            : `<button class="small" data-copy-text="${encodeURIComponent(item.url)}">کپی لینک</button>
               <a class="button small ghost" href="${url}" target="_blank" rel="noreferrer">باز کردن در کلاینت</a>`}
        </div>
        ${isCustom ? `<pre id="custom-json-preview-${index}" class="custom-json-preview hidden" dir="ltr" tabindex="0"></pre>` : ''}
      </article>`;
  }).join('');

}

function fallbackSubscriptionUrl({ format = '', compat = '' } = {}) {
  return absolutePortalUrl(`/sub/${encodeURIComponent(email)}`, { format, compat });
}

function fallbackUserPageUrl({ compat = '' } = {}) {
  return absolutePortalUrl(`/u/${encodeURIComponent(email)}`, { compat });
}

function setLink(id, href) {
  const el = $(id);
  if (el && href) el.href = href;
}

function setValue(id, value) {
  const el = $(id);
  if (el) el.value = value || '';
}

document.addEventListener('click', (event) => {
  const copySelector = event.target.closest('[data-copy]')?.getAttribute('data-copy');
  if (copySelector) {
    const input = $(copySelector);
    return copyText(input?.value || '');
  }

  const encoded = event.target.closest('[data-copy-text]')?.getAttribute('data-copy-text');
  if (encoded) return copyText(decodeURIComponent(encoded));
  const jsonCopy = event.target.closest('[data-json-copy-url]');
  const jsonPreview = event.target.closest('[data-json-preview-url]');
  if (!jsonCopy && !jsonPreview) return;
  const target = jsonCopy || jsonPreview;
  const url = target.getAttribute(jsonCopy ? 'data-json-copy-url' : 'data-json-preview-url');
  (async () => {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      const config = await response.json();
      if (!response.ok) throw new Error(config.msg || 'خطا در خواندن کانفیگ');
      const content = `${JSON.stringify(config, null, 2)}\n`;
      if (jsonCopy) await copyText(content);
      else {
        const element = document.getElementById(target.getAttribute('data-json-preview-target'));
        if (element) {
          element.textContent = content;
          element.classList.toggle('hidden');
        }
      }
    } catch (error) {
      toast(error.message || 'دریافت JSON ناموفق بود');
    }
  })();
});

async function init() {
  try {
    const apiQuery = queryString(isV2BoxMode ? { compat: 'v2box' } : {});
    const response = await fetch(withBase(`/api/user/${encodeURIComponent(email)}${apiQuery}`), { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.msg || 'دریافت اطلاعات سرویس با خطا مواجه شد');

    const data = payload.obj;
    const normalSubscriptionUrl = data.subscriptionUrl || fallbackSubscriptionUrl();
    const rawSubscriptionUrl = data.rawSubscriptionUrl || fallbackSubscriptionUrl({ format: 'raw' });
    const v2boxSubscriptionUrl = data.v2boxSubscriptionUrl || fallbackSubscriptionUrl({ compat: 'v2box' });
    const rawV2boxSubscriptionUrl = data.rawV2boxSubscriptionUrl || fallbackSubscriptionUrl({ format: 'raw', compat: 'v2box' });
    const v2boxUserPageUrl = data.v2boxUserPageUrl || fallbackUserPageUrl({ compat: 'v2box' });
    const normalUserPageUrl = data.userPageUrl || fallbackUserPageUrl();
    const activeSubscriptionUrl = isV2BoxMode ? v2boxSubscriptionUrl : normalSubscriptionUrl;

    $('#statusPill').textContent = data.client.enable ? (isV2BoxMode ? 'فعال - V2Box' : 'فعال') : 'غیرفعال';
    $('#statusPill').classList.toggle('danger', !data.client.enable);
    $('#title').textContent = isV2BoxMode
      ? `اشتراک V2Box کاربر ${data.client.email}`
      : `اشتراک کاربر ${data.client.email}`;
    $('#summary').textContent = isV2BoxMode
      ? `${data.links.length} کانفیگ لینکی و ${(data.additionalConfigs || []).length} کانفیگ JSON آماده شد. مصرف فعلی: ${formatBytes(data.usedTraffic)} از ${data.client.totalGB ? formatBytes(data.client.totalGB) : 'نامحدود'}`
      : `${data.links.length} کانفیگ لینکی و ${(data.additionalConfigs || []).length} کانفیگ JSON آماده شد. مصرف فعلی: ${formatBytes(data.usedTraffic)} از ${data.client.totalGB ? formatBytes(data.client.totalGB) : 'نامحدود'}`;

    const modeBadge = $('#modeBadge');
    if (modeBadge) modeBadge.textContent = isV2BoxMode ? 'V2Box Compatible' : 'User Subscription';

    // File-backed JSON is independent of the panel's VLESS link list.
    if (data.jsonSubscriptionUrl) {
      $('#jsonAction')?.classList.remove('hidden');
      setValue('#jsonSubscriptionUrl', data.jsonSubscriptionUrl);
      setLink('#openJsonSub', data.jsonSubscriptionUrl);
      const downloadUrl = new URL(data.jsonSubscriptionUrl);
      downloadUrl.searchParams.set('download', '1');
      setLink('#downloadJsonSub', downloadUrl.toString());
      $('#copyJsonBody')?.addEventListener('click', async () => {
        try {
          const response = await fetch(data.jsonSubscriptionUrl, { cache: 'no-store' });
          const body = await response.text();
          if (!response.ok) throw new Error(body);
          await copyText(body);
        } catch (error) {
          toast(error.message || 'دریافت JSON ناموفق بود');
        }
      });
    }

    if (data.jsonCollectionUrl) {
      setValue('#jsonCollectionUrl', data.jsonCollectionUrl);
      setLink('#openJsonCollection', data.jsonCollectionUrl);
    }

    setValue('#subscriptionUrl', normalSubscriptionUrl);
    setValue('#v2boxSubscriptionUrl', v2boxSubscriptionUrl);
    setLink('#openSub', normalSubscriptionUrl);
    setLink('#openRawSub', rawSubscriptionUrl);
    setLink('#openV2boxSub', v2boxSubscriptionUrl);
    setLink('#openRawV2boxSub', rawV2boxSubscriptionUrl);
    setLink('#openV2boxPage', v2boxUserPageUrl);
    setLink('#openNormalPage', normalUserPageUrl);

    const qrText = encodeURIComponent(activeSubscriptionUrl);
    $('#subQr').src = withBase(`/qr?text=${qrText}${key ? `&key=${encodeURIComponent(key)}` : ''}`);

    const copyAll = $('#copyAll');
    if (copyAll) {
      copyAll.textContent = isV2BoxMode ? 'کپی لینک‌های V2Box' : 'کپی کانفیگ‌های لینکی (بدون JSON)';
      copyAll.addEventListener('click', () => copyText(data.links.map((item) => item.url).join('\n')));
    }

    const v2boxNotice = $('#v2boxNotice');
    if (v2boxNotice) {
      v2boxNotice.textContent = 'اگر از اپلیکیشن V2Box استفاده می‌کنید از لینک‌های زیر استفاده کنید.';
    }

    const normalPage = $('#openNormalPage');
    const v2boxPage = $('#openV2boxPage');
    if (normalPage) normalPage.classList.toggle('active', !isV2BoxMode);
    if (v2boxPage) v2boxPage.classList.toggle('active', isV2BoxMode);

    renderConfigs(data.links, data.additionalConfigs || []);
    renderDetails(data);
    $('#actions').classList.remove('hidden');
    $('#configsCard').classList.remove('hidden');
    $('#detailsCard').classList.remove('hidden');
  } catch (err) {
    $('#statusPill').textContent = 'خطا';
    $('#statusPill').classList.add('danger');
    $('#summary').textContent = err.message || 'در حال حاضر امکان نمایش اطلاعات وجود ندارد.';
  }
}

init();
