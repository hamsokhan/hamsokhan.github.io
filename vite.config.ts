import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

function buildId() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

export default defineConfig({
  // Relative base: the same build works at a GitHub Pages project path or at a root domain.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(`${buildId()}-${new Date().toISOString().slice(0, 10)}`),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png'],
      manifest: {
        // Stable install identity: keep `id` unchanged even if the name changes.
        id: './?app=hamsokhan',
        name: 'هم‌سخن',
        short_name: 'هم‌سخن',
        description: 'خواندن و فهم شعر فارسی، بیت به بیت',
        lang: 'fa',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F8F5EE',
        theme_color: '#F8F5EE',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell and bundled poems only. AI responses and
        // personal data are never put in the service-worker cache (personal
        // data lives in IndexedDB).
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,jpg}'],
        globIgnores: ['**/fa-brands-*', '**/fa-v4compatibility*', '**/*.ttf'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
