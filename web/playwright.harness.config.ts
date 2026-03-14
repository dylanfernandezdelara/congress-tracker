import { defineConfig } from '@playwright/test'

const baseURL = process.env.HARNESS_WEB_URL ?? 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: './tests/harness',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: '../target/harness/browser/playwright',
})
