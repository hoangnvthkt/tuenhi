import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PRODUCTION_BASE_URL ?? 'https://tuenhi.vercel.app';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'production-smoke.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
