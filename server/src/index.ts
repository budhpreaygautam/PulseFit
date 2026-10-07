import config from './config.js';
import db from './db/database.js';
import { seedDatabase } from './db/seed.js';
import app from './server.js';

// First start (or a deleted database file): load the demo data so the app is usable at once.
if (db.isEmpty()) {
  console.log(`📦 No data found at ${db.filePath}; seeding demo data.`);
  seedDatabase();
}

const server = app.listen(config.port, () => {
  console.log(`⚡ PulseFit API listening on http://localhost:${config.port}`);
  console.log(`   demo mode: ${config.demoMode ? 'ON (1-click personas enabled)' : 'off'}`);
});

// Write any debounced change before the process exits (Ctrl+C, tsx watch restarts, deploys).
function shutdown(signal: string) {
  console.log(`\n${signal} received; saving data and shutting down.`);
  try {
    db.flush();
  } finally {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
