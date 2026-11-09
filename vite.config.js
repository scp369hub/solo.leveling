import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'SHADOW SYSTEM',
        short_name: 'SHADOW',
        description: 'A local-first personal progression system.',
        theme_color: '#07090d',
        background_color: '#07090d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg}'] },
    }),
  ],
  test: { environment: 'jsdom', setupFiles: './src/test-setup.js' },
});