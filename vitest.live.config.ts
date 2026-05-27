/**
 * Vitest config for live-cloud tests.
 *
 * Not used by `pnpm test`. Driven by `pnpm test:live:aws` / `pnpm test:live:azure`
 * via `scripts/run-live-tests.mjs`. Live tests hit real cloud providers — see
 * `e2e/<provider>-deployment-tests/README.md` for the env contract.
 */

import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __ICE_VERSION__: JSON.stringify('0.0.0-test'),
  },
  resolve: {
    alias: {
      '@ui': resolve(__dirname, 'packages/ui/src'),
      '@': resolve(__dirname, 'packages/web/src'),
    },
  },
  test: {
    globals: true,
    include: ['packages/core/src/deploy/providers/__tests__/live/**/*.live.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Tests must run sequentially against the live cloud:
    //   - shared quotas (RDS instance count, IAM role count, ENIs)
    //   - shared resource group on Azure
    //   - long-running operations need stable abort signals
    pool: 'forks',
    forks: { singleFork: true },
    fileParallelism: false,
    // 30-min default — RDS/DocDB provisioning, CloudFront propagation can
    // exceed the standard 5s. Individual tests can override via the third
    // arg to `it()`.
    testTimeout: 30 * 60 * 1000,
    hookTimeout: 5 * 60 * 1000,
  },
});
