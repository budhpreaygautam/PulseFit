import config from '../config.js';
import { seedDatabase } from './seed.js';

// `npm run seed`             wipe the database and load the full demo gym.
// `npm run seed -- --catalogue`  wipe it and load only plans, exercises, coaches and the timetable
//                                (no accounts), e.g. to start a real deployment from scratch.
// In production the demo gym also needs `-- --allow-demo`: its staff accounts use the published
// password pulse123.
const catalogueOnly = process.argv.includes('--catalogue');

if (!catalogueOnly && config.isProduction && !process.argv.includes('--allow-demo')) {
  console.error(
    'Refusing to load the demo gym in production: its admin and staff accounts use the published password pulse123.\n' +
      'Load the catalogue only with `npm run seed -- --catalogue`, or add --allow-demo for a public demo that holds no real data.'
  );
  process.exit(1);
}

seedDatabase({ demo: !catalogueOnly });
