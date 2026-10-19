import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173/flyinging/',
    channel: 'msedge',
    colorScheme: 'light',
    locale: 'zh-CN',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'android',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'iphone',
      use: {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173',
    url: 'http://127.0.0.1:4173/flyinging/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
