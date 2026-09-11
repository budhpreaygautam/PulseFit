import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve the dev server over HTTPS using the local self-signed cert in client/certs.
// Falls back to plain HTTP (no `https` option) if the certs haven't been generated yet.
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
        target: 'http://localhost:5004',
        changeOrigin: true
      }
    }
  }
});