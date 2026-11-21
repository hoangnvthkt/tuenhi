import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { documentLibraryChunkName } from './scripts/document-library-chunks.mjs';

// Each production build carries an id; /version.json tells open apps a newer one is live.
const buildId = (
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  `local-${Date.now().toString(36)}`
).slice(0, 12);

const versionFile: Plugin = {
  name: 'tuenhi-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ buildId }),
    });
  },
};

export default defineConfig(({ command }) => ({
  define:
    command === 'build'
      ? { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId) }
      : {},
  build: {
    rolldownOptions: {
      output: {
        manualChunks: documentLibraryChunkName,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    versionFile,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'fonts/Roboto-Regular.ttf',
        'fonts/Roboto-Medium.ttf',
        'favicon.ico',
        'favicon.svg',
        'apple-touch-icon-180x180.png',
      ],
      manifest: {
        name: 'Tuệ Nhi - Bán hàng & Kho',
        short_name: 'Tuệ Nhi',
        description: 'Ứng dụng bán hàng và quản lý kho nội bộ Tuệ Nhi.',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f766e',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
      },
    }),
  ],
}));
