/**
 * Global Teardown — Runs after all tests
 */

import { type FullConfig } from '@playwright/test';

async function globalTeardown(_config: FullConfig) {
  // Nothing to clean up for now — backend stays running
}

export default globalTeardown;
