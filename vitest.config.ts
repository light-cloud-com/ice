import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __ICE_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    globals: true,
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'services/*/src/**/*.test.{ts,tsx}'],
    // `.int.test.ts` files are integration tests that require a live SQLite DB
    // (via `pnpm dev:setup`). Run them with `pnpm test:int` instead.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '**/*.int.test.ts', '**/*.int.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['packages/*/src/**', 'services/*/src/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/__tests__/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/generated/**',
        '**/*.d.ts',
        'packages/db/prisma/**',
      ],
    },
  },
});
