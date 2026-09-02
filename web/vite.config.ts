import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseViteDevPort(raw) {
  if (raw === undefined || raw === '') return 5173
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`VITE_DEV_PORT must be a positive integer (got ${JSON.stringify(raw)})`)
  }
  return n
}

// Defaults match the documented dev URLs (web :5173 -> worker :8787). The
// verification helper overrides both so it can run beside a human dev stack.
const devPort = parseViteDevPort(process.env.VITE_DEV_PORT)
const workerOrigin = process.env.VITE_WORKER_ORIGIN ?? 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@congress-tracker/shared': path.join(repoRoot, 'shared'),
    },
  },
  server: {
    // Bind IPv4 loopback explicitly. Default `localhost` resolves to ::1-only on
    // many Linux/Cloud hosts, so docs/agents curling http://127.0.0.1:5173 fail
    // even though Vite printed "ready".
    host: '127.0.0.1',
    port: devPort,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
    // Same-origin API in dev (see web/src/api/config.ts). Worker must run on
    // workerOrigin (default :8787).
    proxy: {
      '/feed': { target: workerOrigin, changeOrigin: true },
      '/stats': { target: workerOrigin, changeOrigin: true },
      '/health': { target: workerOrigin, changeOrigin: true },
      '/debug': {
        target: workerOrigin,
        changeOrigin: true,
        bypass(req) {
          const path = req.url ?? ''
          // SPA route /debug — only proxy JSON API paths (e.g. /debug/ingest.json).
          if (/^\/debug\/[^?]+\.json(\?|$)/.test(path)) return undefined
          return '/index.html'
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    // jsdom 28+ requires a non-opaque origin or localStorage is unavailable (Node 22+).
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:5173',
      },
    },
    setupFiles: './src/test/setup.ts',
    globals: true,
    css: true,
    exclude: ['output/**'],
  },
})
