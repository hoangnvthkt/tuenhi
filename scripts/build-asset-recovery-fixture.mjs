import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

await build({
  configFile: false,
  plugins: [react()],
  build: {
    outDir: '.superpowers/asset-recovery-dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: resolve('e2e/fixtures/asset-recovery.html'),
    },
  },
});
