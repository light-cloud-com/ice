/**
 * Global Setup — Runs before all tests
 *
 * 1. Ensures backend is running
 * 2. Seeds test user
 * 3. Stores auth state for tests
 */

import { type FullConfig } from '@playwright/test';

const BACKEND_URL = 'http://localhost:5001/api';
const TEST_USER = {
  name: 'Test User',
  email: 'test@ice-saas.dev',
  password: 'password123',
};

async function globalSetup(_config: FullConfig) {
  // 1. Wait for backend to be ready
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

  // 2. Seed test user (try register, fallback to login if exists)
  let token = '';
  const regRes = await fetch(`${BACKEND_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER),
  });
  const regData = await regRes.json();
  if (regData.token) {
    token = regData.token;
  } else {
    // Already exists — login instead
    const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    });
    const loginData = await loginRes.json();
    token = loginData.token || '';
  }

  process.env.TEST_AUTH_TOKEN = token;
  process.env.TEST_USER_EMAIL = TEST_USER.email;
  process.env.TEST_USER_PASSWORD = TEST_USER.password;

  console.log(`[global-setup] Test user ready, token length: ${token.length}`);
}

export default globalSetup;
