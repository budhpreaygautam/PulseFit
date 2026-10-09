import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Each test file runs in its own process with its own temporary database file.
    pool: 'forks',
    testTimeout: 20000
  }
});
