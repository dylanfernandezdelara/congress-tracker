# Senator Daily Activity - Web (React + Vite)

React + Vite + TypeScript frontend that displays per-senator daily activity from the **Senate Data Worker API**.

## Architecture

Two services work together:

- **Worker API** (`workers/senate_data_worker/`): Backend that ingests Senate activity data, processes it, and serves JSON via HTTP API
  - **Why needed**: Web app is frontend-only and can't fetch Senate data directly
  - **URL**: `http://localhost:8787`

- **Web App** (`web/`): Frontend UI that fetches and displays member activity data
  - **Why needed**: This is the actual website users interact with
  - **URL**: `http://localhost:5173`

**Both must run together** - the web app fetches data from the worker API.

## Local Development

Run both services in separate terminals:

### Terminal 1: Worker API
```bash
cd workers/senate_data_worker
npm ci          # First time only
npm run dev     # Starts on http://localhost:8787
```

### Terminal 2: Web App
```bash
cd web
npm ci          # First time only
npm run dev     # Starts on http://localhost:5173
```

Open `http://localhost:5173` in your browser.

## API Configuration

The web app resolves the API URL in this order:
1. `localStorage("apiUrl")` (UI Settings panel)
2. `VITE_API_URL` (environment variable)
3. `http://localhost:8787` (default)

**Optional**: Create `web/.env.local`:
```bash
VITE_API_URL=http://localhost:8787
```

## Production Build

```bash
cd web
npm ci
npm run build    # Output: web/dist/
npm run preview  # Test production build locally
```

## Deployment (Cloudflare Pages)

**Settings**:
- Root directory: `web`
- Build command: `npm ci && npm run build`
- Build output: `dist`

**Environment variable**: Set `VITE_API_URL` to your deployed worker URL.

Deep links handled via `web/public/_redirects`.
