import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://cubo:cubo@127.0.0.1:5432/money_adventure_test',
      JWT_SECRET: 'segreto-di-test',
      COACH_AI_ENABLED: 'false',
    },
    globals: false,
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // I test che toccano il database condividono lo stesso schema: niente parallelismo.
    fileParallelism: false,
  },
});
