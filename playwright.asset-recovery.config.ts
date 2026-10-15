import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'asset-recovery.spec.ts',
  use: { baseURL: 'http://127.0.0.1:5181', serviceWorkers: 'block' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command:
      'node scripts/build-asset-recovery-fixture.mjs && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5181 --strictPort --outDir .superpowers/asset-recovery-dist',
    url: 'http://127.0.0.1:5181/e2e/fixtures/asset-recovery.html',
    reuseExistingServer: false,
  },
});
