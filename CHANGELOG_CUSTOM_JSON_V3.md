# گزارش اصلاح سوم: Custom Xray JSON واقعی

## چرا دو نسخه قبلی نیاز را رفع نکردند؟

- خروجی `format=json` صرفاً یک فایل جدا را تحویل می‌داد و لینک آن در صفحه بود؛ برای استفادهٔ واقعی از **Custom Config** هیچ پیش‌نمایش درجا یا فرمت مجموعه‌ای برای API وجود نداشت.
- VLESS طبق قالب تخت نمونه منتقل شده بود؛ این نسخه خروجی معمول `settings.vnext[].users[]` را برای سازگاری بیشتر می‌سازد.
- خروجی Base64 نمی‌تواند کانفیگ Custom با DNS/route کامل را به‌صورت نود قابل import حفظ کند. این یک محدودیت فرمت/کلاینت است، نه باگ تولید JSON.

## تغییرات کد

1. `xray-json.js`: خواندن مستقل از فایل، اعتبارسنجی، تبدیل VLESS به `vnext/users`، حفظ همه بخش‌های دیگر و خواندن ECH از فایل؛ ساخت JSON Collection با دقیقاً یک آیتم Custom.
2. `server.js`: افزودن خروجی `format=json-list` و alias `format=custom-json`، حفظ `format=json` به‌صورت فایل Xray قابل‌اجرا، اضافه‌شدن مشخصه‌های `type=custom` و `format=json` به API.
3. `public/user.js` و `public/user.html`: کانفیگ Custom در کنار لینک‌ها با پیش‌نمایش JSON کامل، کپی کل JSON، دانلود فایل و لینک به JSON Collection.
4. `public/style.css`: نمایش خوانای JSON در صفحهٔ راست‌به‌چپ.
5. `scripts/json-config.test.mjs`: شش تست مستقل؛ شامل حفظ همه بخش‌ها، فقط یک آیتم Custom، تغییر ECH، بارگذاری مجدد، و خطاهای اعتبارسنجی.
6. `scripts/smoke-test.mjs`: گسترش بررسی HTTP برای فایل Custom و JSON Collection.

## مسیرها

| مسیر | رفتار |
|---|---|
| `/sub/EMAIL` | اشتراک Base64 قبلی، دست‌نخورده |
| `/sub/EMAIL?format=raw` | لینک‌های خام قبلی، دست‌نخورده |
| `/sub/EMAIL?format=json` | یک کانفیگ Custom کامل Xray JSON |
| `/sub/EMAIL?format=custom-json` | معادل بالا |
| `/sub/EMAIL?format=json-list` | فهرست JSON: تمام لینک‌های قبلی + دقیقاً یک Custom (config object) |
| `/api/user/EMAIL` | فهرست صفحه با یک آیتم Custom مشخص |

## ECH

در هر درخواست، `templates/extra-xray-config.json` و `ech-updater-data/last_ech.txt` خوانده می‌شود. تنها مقدار `outbounds[tag=proxy].streamSettings.tlsSettings.echConfigList` به‌روزرسانی می‌شود. مقدار نداشتن فایل ECH، خطای 503 می‌دهد. تازه‌بودن اطلاعات ECH در DNS بیرونی از این تست اثبات نشده و به updater بستگی دارد.

## نتیجهٔ آزمون‌ها

- `node --test scripts/json-config.test.mjs`: ۶ تست موفق.
- `node --check`: فایل‌های اصلی و تست‌ها بدون خطای نحوی.
- تست واقعی HTTP اجرا نشد، زیرا `express`، `helmet` و `qrcode` نصب نبودند و npm در این محیط به `registry.npmjs.org` دسترسی نداشت (`EAI_AGAIN`).
- راه‌اندازی Xray واقعی یا صحت TLS/ECH و رسیدن به سرور مقصد، در این محیط آزمایش نشد.

## محدودیت سازگاری

فهرست `json-list` فرمت اختصاصی API این پروژه است؛ آن را به‌عنوان Subscription استاندارد v2rayN معرفی نکنید. برای واردکردن Custom JSON کامل باید کلاینت/هستهٔ Xray با این قابلیت وجود داشته باشد. تنظیمات TLS و XHTTP پیشرفته ممکن است به نسخهٔ جدید Xray نیاز داشته باشند.
