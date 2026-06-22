import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 地理院タイル(国土地理院)のホスト。現場(オフライン)でも事前DL分はSWが返す。
const GSI_TILE_HOST = 'https://cyberjapandata.gsi.go.jp';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'Plotto - ローラー営業 顧客管理',
        short_name: 'Plotto',
        description: '地図起点の顧客管理（人材派遣ローラー営業向け）',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'ja',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // アプリシェル
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // 地理院タイルを実行時キャッシュ。準備モードで歩いた/開いた範囲が現場で効く。
        runtimeCaching: [
          {
            urlPattern: new RegExp(`^${GSI_TILE_HOST}/xyz/.*`),
            handler: 'CacheFirst',
            options: {
              cacheName: 'gsi-tiles',
              expiration: {
                maxEntries: 8000,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90日
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
