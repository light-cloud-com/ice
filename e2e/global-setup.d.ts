/**
 * Global Setup — Runs before all tests
 *
 * Community edition: no login required — just ensures backend is running.
 * The gateway auto-seeds a local user and skips JWT validation.
 */
import { type FullConfig } from '@playwright/test';
declare function globalSetup(_config: FullConfig): Promise<void>;
export default globalSetup;
