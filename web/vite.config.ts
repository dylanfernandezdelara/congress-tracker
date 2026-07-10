import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
    port: 5173,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
    // Same-origin API in dev (see web/src/api/config.ts). Worker must run on :8787.
    proxy: {
      '/feed': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/stats': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        bypass(req) {
          const path = req.url ?? ''
          // SPA route /stats — only proxy JSON API paths (e.g. /stats/session.json).
          if (/^\/stats\/[^?]+\.json(\?|$)/.test(path)) return undefined
          return '/index.html'
        },
      },
      '/health': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/debug': { target: 'http://127.0.0.1:8787', changeOrigin: true },
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
