# V2 Sub Page

یک پروژه‌ی سبک برای ساخت صفحه‌ی subscription برای کاربرهای پنل. توکن پنل فقط در بک‌اند نگهداری می‌شود و فرانت‌اند مستقیم به API پنل درخواست نمی‌زند.

## امکانات

- دریافت اطلاعات کاربر از endpoint پنل: `/panel/api/clients/get/{email}`
- دریافت لینک‌های کانفیگ از endpoint پنل: `/panel/api/clients/subLinks/{subId}`
- نمایش صفحه‌ی زیبا، سبک، RTL و responsive
- نمایش لینک‌های کانفیگ و جزئیات کاربر
- صفحه‌ی سازگار با V2Box روی همان مسیر کاربر: `/u/:email?compat=v2box`
- ساخت لینک subscription قابل import در کلاینت‌های رایج
- خروجی Base64 برای subscription: `/sub/:email`
- خروجی خام newline-separated: `/sub/:email?format=raw`
- خروجی سازگار با V2Box برای ECH: `/sub/:email?compat=v2box`
- نمایش کانفیگ‌های سازگار با V2Box در API صفحه کاربر: `/api/user/:email?compat=v2box`
- QR Code برای subscription
- اضافه‌کردن خودکار پارامتر `ech` به کانفیگ‌های `vless://` از فایل `ech-updater-data/last_ech.txt` با encode استاندارد، و ساخت خروجی جداگانه‌ی سازگار با V2Box
- تنظیم سیاست ECH و override پورت به ازای هر `sni`: حالت `ech`، حالت `off`، حالت `both`، و پورت اختیاری
- مدیریت هاست‌های جایگزین به‌صورت جداگانه برای هر host اصلی از مسیر مخفی ادمین `HOST_SECRET_PATH/hosts`، ذخیره در فایل‌های txt جدا، و API مخفی `HOST_SECRET_PATH/api`
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

صفحه مستقیم مخصوص V2Box:

```text
http://localhost:3000/u/USER_EMAIL_OR_ID?compat=v2box
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
APP_CONFIG_PATH=./config/config.json
HOSTS_DIR_PATH=./data/hosts
HOST_SECRET_PATH=hosts-secret
HOSTS_ADMIN_KEY=
```

اگر `PANEL_API_TOKEN` را با `Bearer ` شروع کنی، برنامه همان را استفاده می‌کند. اگر فقط خود توکن را بگذاری، خودش `Bearer` را اضافه می‌کند.


## ECH برای VLESS

برنامه قبل از ساخت خروجی، مقدار ECH را از فایل `ech-updater-data/last_ech.txt` می‌خواند. مقدار داخل فایل باید خام باشد، مثلا:

```text
AEX+DQBBnQAgACAuUyG3EwlOlnDr5/s2GM04Ruokm4DKWz+ouys2fCitRwAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=
```

در خروجی معمولی، این مقدار بدون استفاده از parser خراب‌کننده‌ی `+`، خودکار URL-encode می‌شود؛ یعنی `+` به `%2B`، `/` به `%2F` و `=` به `%3D` تبدیل می‌شود. اگر فایل تغییر کند، نیاز به restart نیست؛ برنامه در هر درخواست `/api/user/:email` و `/sub/:email` دوباره فایل را می‌خواند.

### خروجی جداگانه برای V2Box

بعضی نسخه‌های V2Box مقدار `ech` را دوبار decode/parse می‌کنند و در نتیجه `+` را به فاصله تبدیل می‌کنند. برای همین یک خروجی جدا اضافه شده است که فقط داخل مقدار `ech`، علامت `+` را به‌صورت double-encoded می‌فرستد:

```text
+      => %2B      در خروجی معمولی
+      => %252B    در خروجی V2Box
```

لینک اشتراک سازگار با V2Box:

```text
http://localhost:3000/sub/USER_EMAIL_OR_ID?compat=v2box
```

خروجی خام سازگار با V2Box:

```text
http://localhost:3000/sub/USER_EMAIL_OR_ID?format=raw&compat=v2box
```

صفحه‌ی نمایش کانفیگ‌ها و لینک‌های مخصوص V2Box:

```text
http://localhost:3000/u/USER_EMAIL_OR_ID?compat=v2box
```

در این صفحه، لیست کانفیگ‌ها هم با نسخه‌ی سازگار با V2Box نمایش داده می‌شود.

این تغییر فقط روی پارامتر `ech` لینک‌های `vless://` اعمال می‌شود. خروجی معمولی همچنان `%2B` می‌سازد تا کلاینت‌هایی مثل v2rayNG، v2rayN و بقیه کلاینت‌های درست خراب نشوند.

### تنظیم ECH و پورت به ازای هر SNI

فایل پیش‌فرض تنظیمات عمومی برنامه این است:

```text
config/config.json
```

چون این فایل فقط برای ECH نیست و حالا override پورت هم داخل آن تعریف می‌شود، ساختار پیشنهادی این است که تنظیمات VLESS داخل بخش `vless` قرار بگیرد:

```json
{
  "vless": {
    "defaultEchMode": "ech",
    "sniPolicies": {
      "example.com": "both",
      "www.example.com": {
        "ech": "ech",
        "port": 2083
      },
      "no-ech.example.com": "off",
      "*.ech.example.com": {
        "ech": "ech",
        "port": 8443
      }
    }
  }
}
```

اگر فقط سیاست ECH لازم داری، مقدار ساده‌ی string مثل قبل کار می‌کند. اگر خواستی پورت هم عوض شود، مقدار همان SNI را object کن و `port` بده. مثلا برای `sni=www.example.com`، پورت داخل بخش `uuid@host:port` با `2083` جایگزین می‌شود. اگر `port` ننویسی، همان پورت اصلی کانفیگ باقی می‌ماند. اگر داخل object مقدار `ech` را حذف کنی، سیاست ECH از `defaultEchMode` گرفته می‌شود و فقط پورت override می‌شود.

حالت‌ها:

```text
ech   => کانفیگ با ECH ساخته می‌شود
off   => کانفیگ بدون ECH ساخته می‌شود و اگر ech از قبل داخل لینک باشد حذف می‌شود
both  => یک نسخه با ECH و یک نسخه بدون ECH ساخته می‌شود
```

اگر داخل لینک `vless://` پارامتر `sni` وجود داشته باشد، همین مقدار برای انتخاب سیاست و پورت استفاده می‌شود. اگر `sni` وجود نداشته باشد، host اصلی لینک یعنی بخش `uuid@host:port` به‌عنوان fallback استفاده می‌شود. مقدار `defaultEchMode` برای SNIهایی استفاده می‌شود که داخل فایل config نیامده‌اند. مقدار `port` فقط عدد معتبر ۱ تا ۶۵۵۳۵ را قبول می‌کند؛ مقدار نامعتبر نادیده گرفته می‌شود و پورت اصلی کانفیگ دست‌نخورده می‌ماند. مسیر config را هم می‌توانی از `.env` تغییر بدهی:

```env
APP_CONFIG_PATH=/path/to/config/config.json
```

برای سازگاری با نسخه‌ی قبلی، برنامه هنوز `ECH_CONFIG_PATH` و ساختار قدیمی `ech-config.json` را هم می‌فهمد؛ ولی برای کد جدید بهتر است از `APP_CONFIG_PATH` و `config/config.json` استفاده کنی.

نکته‌ی پیشنهادی برای Docker: فقط فولدرهای داده‌ی ECH و config را mount کن، نه کل `/app` را. این یعنی کد برنامه و `node_modules` داخل image می‌مانند و فقط فایل‌های متغیر از host خوانده می‌شوند:

```yaml
volumes:
  - /root/dev/Market/ech-updater-data:/app/ech-updater-data:ro
  - /root/dev/Market/config:/app/config:ro
```

روی سرور، فولدر و فایل‌ها را این‌طوری بساز:

```bash
mkdir -p /root/dev/Market/ech-updater-data /root/dev/Market/config
cat > /root/dev/Market/ech-updater-data/last_ech.txt <<'EOF'
AEX+DQBBnQAgACAuUyG3EwlOlnDr5/s2GM04Ruokm4DKWz+ouys2fCitRwAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=
EOF

cat > /root/dev/Market/config/config.json <<'EOF'
{
  "vless": {
    "defaultEchMode": "ech",
    "sniPolicies": {
      "example.com": "both",
      "www.example.com": {
        "ech": "ech",
        "port": 2083
      },
      "no-ech.example.com": "off"
    }
  }
}
EOF
```

مسیر پیش‌فرض فایل ECH همچنان داخل فولدر `ech-updater-data` کنار برنامه است، ولی می‌توانی در `.env` مسیر دیگری بدهی:

```env
ECH_FILE_PATH=/path/to/ech-updater-data/last_ech.txt
```


## مدیریت هاست‌های جایگزین برای هر host اصلی

صفحه‌ی مدیریت hostها دیگر روی مسیر عمومی `/hosts` نیست. اول یک مسیر مخفی مخصوص مدیریت hostها تعریف کن:

```env
HOST_SECRET_PATH=hosts-secret
HOSTS_ADMIN_KEY=ADMIN_ONLY_KEY
```

بعد صفحه‌ی مدیریت این‌طور در دسترس است:

```text
http://localhost:3000/hosts-secret/hosts?key=ADMIN_ONLY_KEY
```

اگر `SECRET_PATH` هم فعال باشد، مسیر نهایی این می‌شود:

```text
http://localhost:3000/my-secret-path/hosts-secret/hosts?key=ADMIN_ONLY_KEY
```

`HOSTS_ADMIN_KEY` فقط برای مدیریت hostهاست. اگر آن را خالی بگذاری، برنامه از `ACCESS_KEY` استفاده می‌کند؛ اگر هر دو خالی باشند، صفحه و API مدیریت hostها غیرفعال می‌شوند.

در این نسخه، hostهای جایگزین دیگر یک فایل مشترک برای همه‌ی کانفیگ‌ها ندارند. برای هر host اصلی، یک فایل txt جدا ساخته می‌شود. مثلا اگر کانفیگ اصلی این باشد:

```text
vless://uuid@market.hqmq.com:443?...
```

فایل جایگزین‌های آن داخل این مسیر ذخیره می‌شود:

```text
./data/hosts/market.hqmq.com.txt
```

مسیر پیش‌فرض فولدر فایل‌ها:

```env
HOSTS_DIR_PATH=./data/hosts
```

می‌توانی صفحه را مستقیم برای یک host مشخص باز کنی:

```text
http://localhost:3000/hosts-secret/hosts?host=market.hqmq.com&key=ADMIN_ONLY_KEY
```

یا با `SECRET_PATH`:

```text
http://localhost:3000/my-secret-path/hosts-secret/hosts?host=market.hqmq.com&key=ADMIN_ONLY_KEY
```

در textarea هر host جایگزین را در یک خط بنویس:

```text
host1.example.com
host2.example.com
host3.example.com
```

برای هر کانفیگ `vless://`، خروجی اشتراک اول کانفیگ اصلی را نگه می‌دارد. بعد فقط اگر برای host اصلی همان کانفیگ فایل txt وجود داشته باشد، به تعداد hostهای داخل همان فایل، کانفیگ اضافه می‌سازد. فقط بخش host در این قسمت تغییر می‌کند:

```text
vless://uuid@HOST:port?...
```

query، `ech`, `sni`, `path` و بقیه‌ی پارامترها همان مقدار کانفیگ اصلی باقی می‌مانند. پورت هم در حالت عادی همان مقدار اصلی است؛ فقط اگر برای SNI آن کانفیگ داخل `config/config.json` مقدار `port` گذاشته باشی، همان پورت override شده روی host اصلی و hostهای جایگزین اعمال می‌شود.

### API مدیریت hostهای جایگزین

مسیر API دیگر جداگانه با `HOSTS_API_PATH` تنظیم نمی‌شود؛ همیشه از روی `HOST_SECRET_PATH` ساخته می‌شود:

```env
HOSTS_API_PATH = HOST_SECRET_PATH/api
```

مثلا اگر مقدار زیر را داشته باشی:

```env
HOST_SECRET_PATH=hosts-secret
```

API این‌طوری می‌شود:

```text
http://localhost:3000/hosts-secret/api
```

و اگر `SECRET_PATH` هم فعال باشد:

```text
http://localhost:3000/my-secret-path/hosts-secret/api
```

برای اینکه مشخص کنی کدام فایل txt خوانده یا نوشته شود، پارامتر `host` لازم است. این API فقط با `HOSTS_ADMIN_KEY`، یا در صورت خالی بودن آن با `ACCESS_KEY`، پاسخ می‌دهد.

خواندن فایل مخصوص `market.hqmq.com`:

```bash
curl "http://localhost:3000/hosts-secret/api?host=market.hqmq.com&key=ADMIN_ONLY_KEY"
```

نوشتن فایل مخصوص `market.hqmq.com`:

```bash
curl -X POST "http://localhost:3000/hosts-secret/api?host=market.hqmq.com&key=ADMIN_ONLY_KEY" \
  -H "Content-Type: application/json" \
  --data-raw "{\"text\":\"host1.example.com\nhost2.example.com\"}"
```

پاسخ API شامل `targetHost` است تا مطمئن شوی دقیقاً فایل همان host تغییر کرده:

```json
{
  "success": true,
  "obj": {
    "targetHost": "market.hqmq.com",
    "text": "host1.example.com\nhost2.example.com",
    "hosts": ["host1.example.com", "host2.example.com"]
  }
}
```

صفحه‌ی `HOST_SECRET_PATH/hosts` مسیر API را از سرور می‌گیرد، پس لازم نیست داخل `public/hosts.js` چیزی را دستی تغییر بدهی.

برای Docker، مسیر `/app/data` در `docker-compose.yml` به یک volume وصل شده تا فایل‌های txt بعد از rebuild از بین نروند. اگر `HOST_SECRET_PATH`، `HOSTS_ADMIN_KEY` یا `HOSTS_DIR_PATH` را عوض می‌کنی، مقدار آن را داخل فایل `.env` مربوط به Docker هم بگذار.

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
https://sub.example.com/my-secret-path/sub/USER_EMAIL_OR_ID?compat=v2box
```

آدرس‌های بدون secret path، مثل این‌ها، دیگر صفحه اصلی یا API را نشان نمی‌دهند:

```text
https://sub.example.com/
https://sub.example.com/u/USER_EMAIL_OR_ID
https://sub.example.com/sub/USER_EMAIL_OR_ID
https://sub.example.com/sub/USER_EMAIL_OR_ID?compat=v2box
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
APP_CONFIG_PATH=./config/config.json
HOSTS_DIR_PATH=./data/hosts
HOST_SECRET_PATH=hosts-secret
HOSTS_ADMIN_KEY=
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
http://localhost:3000/my-secret-path/sub/EMAIL?compat=v2box&key=ACCESS_KEY
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
COPY config ./config
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
      - /root/dev/Market/config:/app/config:ro
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

در `docker-compose.yml` هیچ volumeای مثل `.:/app` یا `/root/dev/Market:/app` نباید باشد؛ چون باعث می‌شود `server.js` و `node_modules` نصب‌شده داخل image مخفی شوند. فقط فولدرهای ECH و config را جداگانه روی `/app/ech-updater-data` و `/app/config` mount کن.

Dockerfile از registry عمومی npm استفاده می‌کند:

```text
https://registry.npmjs.org/
```

و dependencyها را با import واقعی async تست می‌کند، نه تست ظاهری.

## UI Update

The service details section is intentionally limited to production-safe operational fields only: traffic limit, used traffic, expiration date, service status, creation time, and last update time.
