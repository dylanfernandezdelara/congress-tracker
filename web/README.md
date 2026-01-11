# NY Senators Voting Record - Web (React + Vite)

React + Vite + TypeScript app that reads the latest NY Senate vote state from the Worker:

- **API**: `GET /state/NY/latest.json`

## Local development

### 1) Run the Worker

In one terminal:

```bash
cd workers/senate_data_worker
npm ci
npm run dev
```

By default this serves at `http://localhost:8787`.

### 2) Run the web app

In another terminal:

```bash
cd web
npm ci
npm run dev
```

Open the Vite dev server URL (usually `http://localhost:5173`).

## API base URL configuration

The web app resolves the API base URL in this order:

1. **`localStorage("apiUrl")`** (user override)
2. **`VITE_API_URL`** (Vite env var)
3. **`http://localhost:8787`** (default)

### Set `VITE_API_URL` (optional)

Create `web/.env.local`:

```bash
VITE_API_URL=https://your-worker.example.workers.dev
```

Or set it for one command:

```bash
cd web
VITE_API_URL=http://localhost:8787 npm run dev
```

## Build / preview

```bash
cd web
npm ci
npm run build
npm run preview
```

The production build output is in `web/dist`.

## Deploy to Cloudflare Pages (static)

This app is a static SPA (no SSR). Deep links are handled via `web/public/_redirects`.

### Pages settings

- **Root directory**: `web`
- **Build command**: `npm ci && npm run build`
- **Build output directory**: `dist`

### Runtime configuration

- **Preferred**: set `VITE_API_URL` at build time (Pages → Settings → Environment variables).
- **Fallback**: use the in-app override stored in `localStorage("apiUrl")` if you’re testing against different Worker URLs.

