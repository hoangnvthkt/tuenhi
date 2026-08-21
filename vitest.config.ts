import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    css: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
    },
  },
});
