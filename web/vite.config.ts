import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg'],
      manifest: {
        name: 'Veroniks — парфюмерный клуб',
        short_name: 'Veroniks',
        description: 'Парфюмерный советник: каталог, похожие ароматы, подбор по описанию',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        background_color: '#14231B',
        theme_color: '#14231B',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // функция, а не RegExp: Workbox сравнивает RegExp с полным URL
            urlPattern: ({ url }) =>
              url.origin === self.location.origin &&
              /^\/api\/(perfumes|meta|similar|autocomplete|config)/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'veroniks-api',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@veroniks/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    // разрешаем адреса туннеля cloudflared (*.trycloudflare.com)
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
