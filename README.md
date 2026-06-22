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
- اضافه‌کردن خودکار پارامتر `ech` به کانفیگ‌های `vless://` از فایل `ech-updater-data/last_ech.txt`
- نگه‌داشتن توکن در `.env`
- گزینه‌ی `SECRET_PATH` برای قرار دادن کل پروژه پشت مسیر مخفی
- گزینه‌ی `ACCESS_KEY` برای محدودکردن دسترسی به لینک‌ها
- آماده برای Docker و Docker Compose

## نصب معمولی

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
SECRET_PATH=
ACCESS_KEY=
ECH_FILE_PATH=./ech-updater-data/last_ech.txt
```

اگر `PANEL_API_TOKEN` را با `Bearer ` شروع کنی، برنامه همان را استفاده می‌کند. اگر فقط خود توکن را بگذاری، خودش `Bearer` را اضافه می‌کند.


## ECH برای VLESS

برنامه قبل از ساخت خروجی، مقدار ECH را از فایل `ech-updater-data/last_ech.txt` می‌خواند و به همه‌ی لینک‌های `vless://` به صورت پارامتر `ech` اضافه می‌کند. مقدار داخل فایل باید خام باشد، مثلا:

```text
AEX+DQBBnQAgACAuUyG3EwlOlnDr5/s2GM04Ruokm4DKWz+ouys2fCitRwAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=
```

در خروجی لینک، این مقدار خودکار URL-encode می‌شود؛ یعنی `+` به `%2B`، `/` به `%2F` و `=` به `%3D` تبدیل می‌شود. اگر فایل تغییر کند، نیاز به restart نیست؛ برنامه در هر درخواست `/api/user/:email` و `/sub/:email` دوباره فایل را می‌خواند.

نکته‌ی پیشنهادی برای Docker: فقط فولدر داده‌ی ECH را mount کن، نه کل `/app` را. این یعنی کد برنامه و `node_modules` داخل image می‌مانند و فقط فایل متغیر ECH از host خوانده می‌شود:

```yaml
volumes:
  - /root/dev/Market/ech-updater-data:/app/ech-updater-data:ro
```

روی سرور، فولدر و فایل را این‌طوری بساز:

```bash
mkdir -p /root/dev/Market/ech-updater-data
cat > /root/dev/Market/ech-updater-data/last_ech.txt <<'EOF'
AEX+DQBBnQAgACAuUyG3EwlOlnDr5/s2GM04Ruokm4DKWz+ouys2fCitRwAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=
EOF
```

مسیر پیش‌فرض فایل داخل فولدر `ech-updater-data` کنار برنامه است، ولی می‌توانی در `.env` مسیر دیگری بدهی:

```env
ECH_FILE_PATH=/path/to/ech-updater-data/last_ech.txt
```

## Secret Path

اگر بخواهی کل پروژه پشت یک مسیر مخفی باشد، مقدار `SECRET_PATH` را تنظیم کن:

```env
SECRET_PATH=my-secret-path
PUBLIC_BASE_URL=https://sub.example.com
```

در این حالت آدرس‌ها این‌طوری می‌شوند:

```text
https://sub.example.com/my-secret-path/
https://sub.example.com/my-secret-path/u/USER_EMAIL_OR_ID
https://sub.example.com/my-secret-path/sub/USER_EMAIL_OR_ID
https://sub.example.com/my-secret-path/sub/USER_EMAIL_OR_ID?format=raw
```

آدرس‌های بدون secret path، مثل این‌ها، دیگر صفحه اصلی یا API را نشان نمی‌دهند:

```text
https://sub.example.com/
https://sub.example.com/u/USER_EMAIL_OR_ID
https://sub.example.com/sub/USER_EMAIL_OR_ID
```

نکته: `/healthz` عمومی می‌ماند تا Docker healthcheck و reverse proxy بتوانند سرویس را چک کنند. این endpoint داده‌ی حساسی برنمی‌گرداند.

## Access Key

اگر `ACCESS_KEY` را فعال کنی، آدرس‌ها باید کلید داشته باشند:

```env
ACCESS_KEY=YOUR_LONG_RANDOM_KEY
```

نمونه:

```text
https://sub.example.com/my-secret-path/u/USER?key=YOUR_LONG_RANDOM_KEY
https://sub.example.com/my-secret-path/sub/USER?key=YOUR_LONG_RANDOM_KEY
```

همچنین می‌توانی برای درخواست‌های API از header استفاده کنی:

```text
x-access-key: YOUR_LONG_RANDOM_KEY
```

پیشنهاد جدی: `SECRET_PATH` امنیت کامل نیست؛ فقط مسیر را غیرقابل‌حدس‌تر می‌کند. برای production بهتر است `ACCESS_KEY` را هم فعال نگه داری.

## اجرای Docker

1. فایل env را بساز:

```bash
cp .env.docker.example .env
nano .env
```

2. مقدارها را کامل کن:

```env
PANEL_BASE_URL=https://host
PANEL_API_TOKEN=Token
PUBLIC_BASE_URL=https://sub.example.com
PORT=3000
SECRET_PATH=my-secret-path
ACCESS_KEY=یک-کلید-اختیاری-ولی-پیشنهادی
ECH_FILE_PATH=./ech-updater-data/last_ech.txt
```

3. اجرا:

```bash
docker compose up -d --build
```

4. تست:

```bash
curl http://localhost:3000/healthz
```

اگر `SECRET_PATH=my-secret-path` باشد، آدرس صفحه:

```text
http://localhost:3000/my-secret-path/u/EMAIL
```

آدرس subscription:

```text
http://localhost:3000/my-secret-path/sub/EMAIL
```

اگر `ACCESS_KEY` گذاشته‌ای:

```text
http://localhost:3000/my-secret-path/u/EMAIL?key=ACCESS_KEY
http://localhost:3000/my-secret-path/sub/EMAIL?key=ACCESS_KEY
```

## Dockerfile

```dockerfile
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY ech-updater-data ./ech-updater-data
COPY public ./public

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
    build: .
    container_name: v2-sub-page
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "3000:3000"
    volumes:
      - /root/dev/Market/ech-updater-data:/app/ech-updater-data:ro
```

## پشت Nginx یا Caddy

برای production بهتر است container فقط روی سرور داخلی اجرا شود و دامنه HTTPS را با reverse proxy به آن وصل کنی. در این حالت `PUBLIC_BASE_URL` باید همان دامنه نهایی باشد، مثلاً:

```env
PUBLIC_BASE_URL=https://sub.example.com
SECRET_PATH=my-secret-path
```

نمونه Nginx:

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

## دیپلوی سریع با PM2

```bash
npm i -g pm2
pm2 start server.js --name v2-sub-page
pm2 save
```

## نکات امنیتی

- این پروژه توکن پنل را در مرورگر ارسال نمی‌کند.
- بهتر است پروژه پشت HTTPS اجرا شود.
- برای جلوگیری از حدس‌زدن ایمیل/شناسه کاربران، `ACCESS_KEY` را فعال کن.
- `SECRET_PATH` را عمومی منتشر نکن.
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


### Fix note: no dotenv dependency in Docker

This project does not import `dotenv` at runtime. In Docker, variables are injected by `docker-compose.yml` through `env_file: .env`. If you run without Docker, export environment variables yourself or use Node's `--env-file` support:

```bash
node --env-file=.env server.js
```



## رفع مشکل نصب Docker / npm

در این نسخه عمداً `package-lock.json` حذف شده و Dockerfile فقط `package.json` را کپی می‌کند. دلیلش این است که lockfile قبلی در یک محیط دارای registry داخلی ساخته شده بود و روی سرورهای بیرونی ممکن بود `npm ci` نصب ناقص انجام دهد و خطاهایی مثل این بدهد:

```text
Cannot find package '/app/node_modules/express/index.js'
```

برای build تمیز از این دستور استفاده کن:

```bash
docker compose down --rmi local --volumes --remove-orphans
docker builder prune -f
docker compose build --no-cache --pull
docker compose up -d
```

در `docker-compose.yml` هیچ volumeای مثل `.:/app` یا `/root/dev/Market:/app` نباید باشد؛ چون باعث می‌شود `server.js` و `node_modules` نصب‌شده داخل image مخفی شوند. فقط فولدر ECH را روی `/app/ech-updater-data` mount کن.

Dockerfile از registry عمومی npm استفاده می‌کند:

```text
https://registry.npmjs.org/
```

و dependencyها را با import واقعی async تست می‌کند، نه تست ظاهری.

## UI Update

The service details section is intentionally limited to production-safe operational fields only: traffic limit, used traffic, expiration date, service status, creation time, and last update time.
