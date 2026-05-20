import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, './src/utils/react-native-shim.js')
    }
  },
  plugins: [
    react({
      include: '**/*.{jsx,tsx}'
    }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      devOptions: {
        enabled: false
      },
      manifest: {
        name: 'AI Chief of Staff',
        short_name: 'AI CoS',
        description: 'AI Chief of Staff - Your intelligent executive assistant for tracking tasks, commitments, and meeting insights',
        theme_color: '#3b82f6',
        background_color: '#1a1a1d',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,svg,json}'],
        // Don't precache HTML - always fetch fresh
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/_/, /^\/static/],
        runtimeCaching: [
          {
            // HTML files - always check network first, very short cache
            urlPattern: /\.html$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 // 1 minute cache for HTML
              },
              networkTimeoutSeconds: 3
            }
          },
          {
            // JS and CSS - network first with short cache
            urlPattern: /\.(js|css)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              networkTimeoutSeconds: 3
            }
          },
          {
            // Images and static assets - cache first but check network
            urlPattern: /\.(png|jpg|jpeg|svg|ico|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              }
            }
          },
          {
            // API requests - network first, no long-term cache
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              networkTimeoutSeconds: 5
            }
          }
        ],
        // Skip waiting and claim clients immediately for faster updates
        skipWaiting: true,
        clientsClaim: true,
        // Clean up old caches
        cleanupOutdatedCaches: true
      }
    })
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  optimizeDeps: {
    exclude: ['react-native']
  },
  build: {
    outDir: 'build',
    sourcemap: false,
    commonjsOptions: {
      exclude: [/react-native/]
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('/react/')
            || id.includes('/react-dom/')
            || id.includes('/react-router/')
            || id.includes('/react-router-dom/')
          ) {
            return 'react-vendor';
          }
          if (id.includes('/@callstack/liquid-glass/') || id.includes('/react-markdown/')) {
            return 'ui-vendor';
          }
          return undefined;
        }
      }
    }
  },
  preview: {
    port: 3000
  }
});
