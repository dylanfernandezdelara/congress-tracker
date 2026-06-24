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
    fs: {
      allow: [repoRoot],
    },
    // Same-origin API in dev (see web/src/api/config.ts). Worker must run on :8787.
    proxy: {
      '/feed': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/stats': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/debug': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/game': { target: 'http://127.0.0.1:8787', changeOrigin: true },
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
