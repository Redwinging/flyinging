import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/flyinging/',
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'icons/icon.svg',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        name: 'Flyinging 复算器',
        short_name: '复算器',
        description: '轻量、离线可用的实数与复数计算器',
        lang: 'zh-CN',
        start_url: '/flyinging/',
        scope: '/flyinging/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f1fbf9',
        theme_color: '#65c8e2',
        categories: ['utilities', 'productivity'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{css,html,ico,js,png,svg,webmanifest,woff2}'],
        navigateFallback: '/flyinging/index.html',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
