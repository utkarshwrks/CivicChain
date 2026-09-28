import { defineConfig } from 'vitest/config';

// Backend test suite (Vitest + supertest). Frontend tests live in frontend/.
export default defineConfig({
  test: {
    include: ['backend/tests/**/*.test.js'],
    environment: 'node',
    setupFiles: ['backend/tests/setup.js'],
    testTimeout: 20_000,
    pool: 'forks',
  },
});
