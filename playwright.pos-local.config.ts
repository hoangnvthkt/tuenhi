import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'pos-mobile-local.spec.ts',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5179', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'mobile-390',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
    {
      name: 'mobile-360',
      use: { browserName: 'chromium', viewport: { width: 360, height: 800 } },
    },
  ],
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5179 --strictPort --mode test',
    url: 'http://127.0.0.1:5179/e2e/fixtures/pos-convenience.html',
    reuseExistingServer: false,
  },
});
