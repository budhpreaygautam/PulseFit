import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config.js';
import apiRoutes from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

// Behind one reverse proxy (Render, Railway, nginx) so rate limits see the real client IP.
app.set('trust proxy', 1);

app.use(
  helmet({
    // The SPA loads Razorpay Checkout, Google Identity Services and remote images.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests and tools such as curl send no Origin header.
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// The Razorpay webhook signature is computed over the exact raw body, so that route must see
// the bytes before express.json() parses them.
app.use('/api/payment/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
// 512 kB leaves room for a resized profile photo sent as a data URL.
app.use(express.json({ limit: '512kb' }));

if (!config.isTest) {
  app.use('/api', (req, _res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

app.use('/api', apiRoutes);

// In production the API also serves the built React app, with a fallback to index.html so
// deep links such as /schedule or /admin/members survive a refresh.
if (config.serveClient && fs.existsSync(path.join(config.clientDistPath, 'index.html'))) {
  app.use(express.static(config.clientDistPath, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(config.clientDistPath, 'index.html'));
  });
}

app.use(errorHandler);

export default app;
