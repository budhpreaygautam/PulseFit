import config from './config.js';
import db from './db/database.js';
import { seedDatabase } from './db/seed.js';
import app from './server.js';

// First start (or a deleted database file). The demo gym includes staff accounts whose password
// is published in the README, so it is only loaded where demo personas are allowed; anywhere else
// the API starts with the catalogue and no accounts.
if (db.isEmpty()) {
  if (config.demoMode) {
    console.log(`📦 No data found at ${db.filePath}; loading the demo gym.`);
    seedDatabase({ demo: true });
  } else {
    console.log(`📦 No data found at ${db.filePath}; loading the starting catalogue (no accounts).`);
    seedDatabase({ demo: false });
    console.log('   Create the first admin: npm run create-admin -- --email you@example.com --name "Your Name"');
  }
}

const server = app.listen(config.port, () => {
  console.log(`⚡ PulseFit API listening on http://localhost:${config.port} (${config.nodeEnv})`);
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
