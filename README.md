# V2 Sub Page

یک پروژه‌ی سبک برای ساخت صفحه‌ی subscription برای کاربرهای پنل. توکن پنل فقط در بک‌اند نگهداری می‌شود و فرانت‌اند مستقیم به API پنل درخواست نمی‌زند.

## امکانات

- دریافت اطلاعات کاربر از endpoint پنل: `/panel/api/clients/get/{email}`
- دریافت لینک‌های کانفیگ از endpoint پنل: `/panel/api/clients/subLinks/{subId}`
- نمایش صفحه‌ی زیبا، سبک، RTL و responsive
- نمایش لینک‌های کانفیگ و جزئیات کاربر
- ساخت لینک subscription قابل import در کلاینت‌های رایج
- خروجی Base64 برای subscription: `/sub/:email`
- خروجی خام newline-separated: `/sub/:email?format=raw`
- QR Code برای subscription
- نگه‌داشتن توکن در `.env`
- گزینه‌ی `ACCESS_KEY` برای محدودکردن دسترسی به لینک‌ها

## نصب

```bash
npm install
cp .env.example .env
nano .env
npm start
```

بعد از اجرا:

```text
http://localhost:3000
```

صفحه مستقیم کاربر:

```text
http://localhost:3000/u/USER_EMAIL_OR_ID
```

لینک subscription:

```text
http://localhost:3000/sub/USER_EMAIL_OR_ID
```

## تنظیمات `.env`

```env
PANEL_BASE_URL=https://host
PANEL_API_TOKEN=Token
PUBLIC_BASE_URL=https://sub.example.com
PORT=3000
ACCESS_KEY=
```

اگر `PANEL_API_TOKEN` را با `Bearer ` شروع کنی، برنامه همان را استفاده می‌کند. اگر فقط خود توکن را بگذاری، خودش `Bearer` را اضافه می‌کند.

اگر `ACCESS_KEY` را فعال کنی، آدرس‌ها باید این‌طوری باشند:

```text
https://sub.example.com/u/USER?key=YOUR_SECRET
https://sub.example.com/sub/USER?key=YOUR_SECRET
```

## دیپلوی سریع با PM2

```bash
npm i -g pm2
pm2 start server.js --name v2-sub-page
pm2 save
```

## نمونه Nginx Reverse Proxy

```nginx
server {
  server_name sub.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## نکات امنیتی

- این پروژه توکن پنل را در مرورگر ارسال نمی‌کند.
- بهتر است پروژه پشت HTTPS اجرا شود.
- برای جلوگیری از حدس‌زدن ایمیل/شناسه کاربران، `ACCESS_KEY` را فعال کن یا مسیرها را پشت لاگین خودت قرار بده.
- در UI، مقدارهای حساس مثل UUID، password، auth و subId به صورت mask شده نمایش داده می‌شوند.
- اگر می‌خواهی مقدارهای حساس کامل نمایش داده شوند، تابع `mask` و `renderDetails` را تغییر بده.

## لینک کلاینت‌ها

- v2rayN: https://github.com/2dust/v2rayN/releases
- v2rayNG: https://github.com/2dust/v2rayNG/releases
- V2Box Android: https://play.google.com/store/apps/details?id=dev.hexasoftware.v2box
- V2Box iOS/macOS: https://apps.apple.com/us/app/v2box-v2ray-client/id6446814690
- Streisand iOS: https://apps.apple.com/us/app/streisand/id6450534064
- Hiddify: https://github.com/hiddify/hiddify-app/releases
- V2Ray Core: https://github.com/v2fly/v2ray-core/releases

## اجرای Docker

1. فایل env را بسازید:

```bash
cp .env.docker.example .env
nano .env
```

2. مقدارها را کامل کنید:

```env
PANEL_BASE_URL=https://host
PANEL_API_TOKEN=Token
PUBLIC_BASE_URL=https://sub.example.com
PORT=3000
ACCESS_KEY=یک-کلید-اختیاری-ولی-پیشنهادی
```

3. اجرا:

```bash
docker compose up -d --build
```

4. تست:

```bash
curl http://localhost:3000/healthz
```

آدرس صفحه:

```text
http://localhost:3000/u/EMAIL
```

آدرس subscription:

```text
http://localhost:3000/sub/EMAIL
```

اگر `ACCESS_KEY` گذاشته‌اید:

```text
http://localhost:3000/u/EMAIL?key=ACCESS_KEY
http://localhost:3000/sub/EMAIL?key=ACCESS_KEY
```

### پشت Nginx یا Caddy

برای production بهتر است container فقط روی سرور داخلی اجرا شود و دامنه HTTPS را با reverse proxy به آن وصل کنید. در این حالت `PUBLIC_BASE_URL` باید همان دامنه نهایی باشد، مثلاً:

```env
PUBLIC_BASE_URL=https://sub.example.com
```

