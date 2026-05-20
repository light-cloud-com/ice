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
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.int.test.ts', '**/*.int.test.tsx'],
  },
});
