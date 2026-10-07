import { seedAuth } from './auth.js';
import { seedPayments } from './payments.js';
import { seedClasses } from './classes.js';
import { seedMembers } from './members.js';
import { seedActivity } from './activity.js';

// Each domain adds its own demo data in its own file, so they can evolve independently.
export function runSeedExtensions(): void {
  seedAuth();
  seedPayments();
  seedClasses();
  seedMembers();
  seedActivity();
}
