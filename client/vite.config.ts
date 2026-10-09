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
  server: {
    port: 5173,
    https: httpsOptions,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5004',
        changeOrigin: true
      }
    }
  }
});
