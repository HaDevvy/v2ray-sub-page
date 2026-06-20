# Subscription Portal

یک پنل اشتراک سبک و آماده‌ی دیپلوی برای نمایش لینک‌های اتصال کاربران. درخواست‌های پنل فقط در بک‌اند انجام می‌شوند، توکن پنل در مرورگر ارسال نمی‌شود و خروجی Subscription برای کلاینت‌هایی مثل v2rayN، v2rayNG، V2Box، Streisand و Hiddify قابل استفاده است.

## قابلیت‌ها

- دریافت اطلاعات کاربر از پنل: `/panel/api/clients/get/{email}`
- دریافت لینک‌های اتصال از پنل با `subId`: `/panel/api/clients/subLinks/{subId}`
- نمایش وضعیت سرویس، مصرف ترافیک، سقف ترافیک، تاریخ انقضا و مشخصات کاربر
- نمایش کانفیگ‌ها با امکان کپی تکی و کپی کامل
- ساخت Subscription URL با خروجی Base64
- پشتیبانی از خروجی خام newline-separated با `format=raw`
- QR Code برای لینک اشتراک
- پشتیبانی از `SECRET_PATH` برای قراردادن سرویس پشت مسیر اختصاصی
- پشتیبانی از `ACCESS_KEY` برای محدودکردن دسترسی
- آماده برای Docker و Docker Compose
- محافظت از فیلدهای حساس در API داخلی؛ مقدارهای خام `uuid`، `password`، `auth` و `subId` به مرورگر ارسال نمی‌شوند.

## ساختار مسیرها

بدون `SECRET_PATH`:

```text
https://sub.example.com/
https://sub.example.com/u/USER_EMAIL_OR_ID
https://sub.example.com/sub/USER_EMAIL_OR_ID
https://sub.example.com/sub/USER_EMAIL_OR_ID?format=raw
```

با `SECRET_PATH=my-secret-path`:

```text
https://sub.example.com/my-secret-path/
https://sub.example.com/my-secret-path/u/USER_EMAIL_OR_ID
https://sub.example.com/my-secret-path/sub/USER_EMAIL_OR_ID
https://sub.example.com/my-secret-path/sub/USER_EMAIL_OR_ID?format=raw
```

مسیر `/healthz` عمومی می‌ماند تا Docker، reverse proxy یا uptime monitor بتواند سلامت سرویس را بررسی کند. این endpoint داده‌ی حساسی برنمی‌گرداند.

## تنظیمات محیطی

فایل `.env` را کنار `docker-compose.yml` یا ریشه پروژه قرار دهید:

```env
PANEL_BASE_URL=https://host
PANEL_API_TOKEN=Token
PUBLIC_BASE_URL=https://sub.example.com
PORT=3000
SECRET_PATH=my-secret-path
ACCESS_KEY=YOUR_LONG_RANDOM_KEY
```

توضیحات:

- `PANEL_BASE_URL`: آدرس پنل بدون `/` انتهایی.
- `PANEL_API_TOKEN`: توکن پنل. اگر با `Bearer ` شروع شود همان مقدار استفاده می‌شود؛ در غیر این صورت برنامه `Bearer` را اضافه می‌کند.
- `PUBLIC_BASE_URL`: دامنه نهایی که کاربر می‌بیند. برای QR و لینک اشتراک استفاده می‌شود.
- `SECRET_PATH`: مسیر اختصاصی سرویس. اختیاری است، اما برای production پیشنهاد می‌شود.
- `ACCESS_KEY`: کلید دسترسی. اختیاری است، اما برای production بهتر است فعال باشد.

## اجرای Docker

```bash
cp .env.docker.example .env
nano .env
docker compose up -d --build
```

تست سلامت:

```bash
curl http://localhost:3000/healthz
```

اگر `SECRET_PATH` و `ACCESS_KEY` فعال باشند:

```text
http://localhost:3000/my-secret-path/u/USER?key=YOUR_LONG_RANDOM_KEY
http://localhost:3000/my-secret-path/sub/USER?key=YOUR_LONG_RANDOM_KEY
```

همچنین می‌توانید به‌جای query string، کلید را با header بفرستید:

```text
x-access-key: YOUR_LONG_RANDOM_KEY
```

## اجرای مستقیم بدون Docker

Node.js نسخه 18 یا بالاتر لازم است.

```bash
npm install
node --env-file=.env server.js
```

یا با export کردن متغیرها:

```bash
export PANEL_BASE_URL=https://host
export PANEL_API_TOKEN=Token
export PUBLIC_BASE_URL=http://localhost:3000
npm start
```

## Dockerfile فعلی

این نسخه عمداً `package-lock.json` ندارد و Dockerfile فقط از `package.json` نصب می‌کند. دلیلش جلوگیری از مشکل lockfile ساخته‌شده با registry ناسازگار است.

```dockerfile
FROM node:20.20.2-bookworm-slim

ENV NODE_ENV=production \
    NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

COPY package.json .npmrc ./

RUN npm install --omit=dev --no-package-lock --no-audit --no-fund \
  && node --input-type=module -e "await import('express'); await import('helmet'); await import('qrcode'); console.log('dependencies ok')" \
  && npm cache clean --force

COPY server.js ./
COPY public ./public

RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
```

## docker-compose.yml

```yaml
services:
  v2-sub-page:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: v2-sub-page
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "3000:3000"
```

هیچ volumeای مثل `.:/app` تعریف نکنید؛ این کار می‌تواند `node_modules` داخل image را مخفی کند و باعث خطای `Cannot find package express` شود.

## Reverse Proxy

برای production بهتر است سرویس پشت HTTPS اجرا شود. نمونه Nginx:

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

در این حالت مقدار `PUBLIC_BASE_URL` باید دامنه نهایی باشد:

```env
PUBLIC_BASE_URL=https://sub.example.com
```

## نکات امنیتی

- توکن پنل در کد فرانت‌اند یا response مرورگر قرار نمی‌گیرد.
- فیلدهای حساس کاربر در API داخلی sanitize می‌شوند.
- `SECRET_PATH` امنیت کامل نیست؛ آن را همراه با `ACCESS_KEY` استفاده کنید.
- سرویس را روی HTTPS منتشر کنید.
- `PUBLIC_BASE_URL` را با دامنه واقعی production تنظیم کنید تا QR و لینک اشتراک درست ساخته شوند.
- مقدارهای `.env` را commit نکنید.

## کلاینت‌های سازگار

- v2rayN: https://github.com/2dust/v2rayN/releases
- v2rayNG: https://github.com/2dust/v2rayNG/releases
- V2Box Android: https://play.google.com/store/apps/details?id=dev.hexasoftware.v2box
- V2Box iOS/macOS: https://apps.apple.com/us/app/v2box-v2ray-client/id6446814690
- Streisand iOS: https://apps.apple.com/us/app/streisand/id6450534064
- Hiddify: https://github.com/hiddify/hiddify-app/releases
- V2Ray Core: https://github.com/v2fly/v2ray-core/releases

## تست

برای اجرای smoke test:

```bash
npm install
npm test
```

تست‌ها موارد زیر را بررسی می‌کنند:

- routeهای اصلی
- secret path
- access key
- proxy کردن درخواست‌های پنل از سمت بک‌اند
- خروجی subscription
- QR Code
- عدم نشت فیلدهای حساس در API داخلی
