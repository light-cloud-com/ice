/**
 * Global Teardown — Runs after all tests
 *
 * Cleans up test projects created during the e2e run.
 */
import { type FullConfig } from '@playwright/test';
declare function globalTeardown(_config: FullConfig): Promise<void>;
export default globalTeardown;
