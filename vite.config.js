import { defineConfig } from 'vite';
import obfuscator from 'rollup-plugin-obfuscator';
import { VitePWA } from 'vite-plugin-pwa';

// Configure obfuscator with desired settings
const createObfuscatorPlugin = (command) => {
  const plugin = obfuscator({
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 1,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 1,
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 1,
    splitStrings: true,
    identifierNamesGenerator: 'hexadecimal',
    debugProtection: false,
    disableConsoleOutput: false,
    exclude: [/node_modules/, /sw\.js/, /workbox-.*\.js/]
  });

  // Only apply in build mode
  plugin.apply = 'build';
  plugin.enforce = 'post';
  return plugin;
};

export default defineConfig(({ command, mode }) => {
  const isBuild = command === 'build';

  return {
    plugins: [
      createObfuscatorPlugin(command),
      VitePWA({
        strategies: 'generateSW',
        injectRegister: 'auto',
        manifest: false,
        devOptions: {
          enabled: true
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,json}'],
          globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/__\/auth/, /firebase-messaging-sw.js/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/pyodide\/v0\.23\.4\/full\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'pyodide-cache-v1',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 30 * 24 * 60 * 60 // 30 Days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/esm\.sh\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'esm-sh-cache',
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'cdnjs-cache',
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: ({ request }) => request.destination === 'script' || request.destination === 'style',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'static-resources',
              }
            }
          ]
        }
      })
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined,
        }
      }
    },
    worker: {
      format: 'iife',
      plugins: () => {
        if (isBuild) {
          return [createObfuscatorPlugin(command)];
        }
        return [];
      }
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      },
      proxy: {
        '/.netlify/functions': {
          target: 'http://localhost:8888',
          changeOrigin: true,
          rewrite: (path) => path
        }
      }
    },
    preview: {
      port: 3000,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    }
  };
});
