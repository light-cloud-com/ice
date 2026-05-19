import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __ICE_VERSION__: JSON.stringify('0.0.0-test'),
  },
  resolve: {
    alias: {
      // Mirror @ice/web's vite.config.ts so tests can resolve the same path
      // aliases the runtime uses. Without this, any test that imports a web
      // source file transitively pulling in `@ui/*` fails resolution at
      // runtime even though tsc happily compiles it via tsconfig paths.
      '@ui': resolve(__dirname, 'packages/ui/src'),
      '@': resolve(__dirname, 'packages/web/src'),
    },
  },
  test: {
    globals: true,
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'services/*/src/**/*.test.{ts,tsx}',
      'apps/*/src/**/*.test.{ts,tsx}',
    ],
    // `.int.test.ts` files are integration tests that require a live SQLite DB
    // (via `pnpm dev:setup`). Run them with `pnpm test:int` instead.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/core/src/schemas/generated/**',
      '**/*.int.test.ts',
      '**/*.int.test.tsx',
      '**/*.svg',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['packages/*/src/**', 'services/*/src/**', 'apps/*/src/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/__tests__/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/generated/**',
        '**/*.d.ts',
        'packages/db/prisma/**',
        '**/*.svg',
      ],
    },
  },
});
