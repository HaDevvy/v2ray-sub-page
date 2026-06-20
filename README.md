# V2 Sub Page

A lightweight V2Ray subscription landing page with backend-only panel API calls.

## What this app does

- Reads the panel token only from environment variables.
- Calls the panel API only from the backend.
- Shows a clean user subscription page.
- Provides a subscription endpoint for apps such as v2rayN, v2rayNG, V2Box, Streisand, and Hiddify.
- Supports a hidden route prefix with `SECRET_PATH`.
- Supports an optional `ACCESS_KEY`.
- Masks sensitive client fields in the browser API response.

## Important security note

The panel token is never sent to the browser.

The browser can access only this app's backend routes, for example:

```text
/SECRET_PATH/api/user/:email
/SECRET_PATH/sub/:email
/SECRET_PATH/qr
```

The backend calls only these panel endpoints:

```text
GET {PANEL_BASE_URL}/panel/api/clients/get/{email}
GET {PANEL_BASE_URL}/panel/api/clients/subLinks/{subId}
```

Raw sensitive client fields such as `uuid`, `password`, `auth`, and `subId` are not returned by `/api/user/:email`; only masked versions are returned. The `/sub/:email` endpoint still returns real config links because subscription clients need them.

## Environment variables

Create `.env` next to `docker-compose.yml`:

```env
PANEL_BASE_URL=https://host
PANEL_API_TOKEN=Token
PUBLIC_BASE_URL=https://sub.example.com
PORT=3000

# Optional hidden path prefix. Example: my-secret-path
SECRET_PATH=my-secret-path

# Optional but strongly recommended.
ACCESS_KEY=your-long-random-key
```

If `PANEL_API_TOKEN` already includes `Bearer`, the app keeps it. Otherwise it sends it as `Bearer <token>`.

## Run with Docker Compose

```bash
docker compose down --rmi local --volumes --remove-orphans
docker compose build --no-cache --pull
docker compose up -d
```

Check logs:

```bash
docker logs -f v2-sub-page
```

Healthcheck:

```bash
curl http://localhost:3000/healthz
```

Expected response:

```json
{"ok":true,"service":"v2-sub-page"}
```

## URLs

If `SECRET_PATH=my-secret-path` and `ACCESS_KEY=your-long-random-key`:

```text
https://sub.example.com/my-secret-path/u/EMAIL?key=your-long-random-key
https://sub.example.com/my-secret-path/sub/EMAIL?key=your-long-random-key
https://sub.example.com/my-secret-path/sub/EMAIL?format=raw&key=your-long-random-key
```

If `SECRET_PATH` is set, `/` intentionally returns 404.

## Run locally without Docker

```bash
npm ci
PANEL_BASE_URL=https://host \
PANEL_API_TOKEN=Token \
PUBLIC_BASE_URL=http://localhost:3000 \
SECRET_PATH=my-secret-path \
ACCESS_KEY=your-long-random-key \
npm start
```

## Smoke test

This project includes a mock-panel smoke test. It does not call your real panel.

```bash
npm ci
npm test
```

The test validates:

- server startup
- `/healthz`
- secret path behavior
- access key behavior
- backend panel proxying
- subscription output
- QR endpoint
- no leakage of raw `uuid`, `password`, `auth`, or `subId` from the browser API response

## Docker troubleshooting

If you see an error like:

```text
Cannot find package '/app/node_modules/express/index.js'
```

it means the container did not get a valid `node_modules` install. Use the clean rebuild command:

```bash
docker compose down --rmi local --volumes --remove-orphans
docker compose build --no-cache --pull
docker compose up -d
```

Also make sure your compose file does not mount the project over `/app` like this:

```yaml
volumes:
  - .:/app
```

That kind of bind mount can hide the `node_modules` installed during image build and cause the exact `express/index.js` error.

This project's `docker-compose.yml` intentionally has no `volumes` section.
