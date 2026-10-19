import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const certPath = path.resolve(__dirname, 'certs/cert.pem');
const keyPath = path.resolve(__dirname, 'certs/key.pem');

const httpsOptions =
  fs.existsSync(certPath) && fs.existsSync(keyPath)
    ? {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      }
    : undefined;

export default defineConfig({
  plugins: [react()],
  build: {
    // No source maps in production builds (web or the app bundle).
    sourcemap: false,
    rollupOptions: {
      output: {
        // React changes far less often than the app, so it gets a chunk of its own that browsers
        // keep cached across deploys. Everything else is split by Vite per page.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
        }
      }
    }
  },
  server: {
    port: 5173,
    https: httpsOptions,
    // Development only: the dev server forwards /api (and /downloads) to the local API. Production
    // builds call the same origin, or VITE_API_URL when it is set at build time (see src/api/client.ts).
    proxy: {
      '/api': {
        // 127.0.0.1, not localhost: the API listens on IPv4 loopback in development, and localhost
        // may resolve to ::1 first.
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5004',
        changeOrigin: true
      },
      // The Android app download (server/src/lib/androidApp.ts).
      '/downloads': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5004',
        changeOrigin: true
      }
    }
  }
});
