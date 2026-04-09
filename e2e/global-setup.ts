/**
 * Global Setup — Runs before all tests
 *
 * Community edition: no login required — just ensures backend is running.
 * The gateway auto-seeds a local user and skips JWT validation.
 */

import { type FullConfig } from '@playwright/test';

const BACKEND_URL = 'http://localhost:5002/api';

async function globalSetup(_config: FullConfig) {
  // Wait for backend to be ready
  let retries = 15;
  while (retries > 0) {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      if (res.ok) break;
    } catch {
      // Backend not ready yet
    }
    retries--;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (retries === 0) {
    throw new Error('Backend not reachable at ' + BACKEND_URL);
  }

  console.log('[global-setup] Backend ready at', BACKEND_URL);
}

export default globalSetup;
