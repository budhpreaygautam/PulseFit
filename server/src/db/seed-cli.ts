import { seedDatabase } from './seed.js';

// `npm run seed`             wipe the database and load the full demo gym.
// `npm run seed -- --catalogue`  wipe it and load only plans, exercises, coaches and the timetable
//                                (no accounts), e.g. to start a real deployment from scratch.
seedDatabase({ demo: !process.argv.includes('--catalogue') });
