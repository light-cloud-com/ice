import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __ICE_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    globals: true,
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'services/*/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
