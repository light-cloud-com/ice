/**
 * Global Teardown — Runs after all tests
 *
 * Cleans up test projects created during the e2e run.
 */

import { type FullConfig } from '@playwright/test';

const BACKEND_URL = 'http://localhost:5001/api';
const TEST_EMAIL = 'test@ice-saas.dev';
const TEST_PASSWORD = 'password123';

// Prefixes used by e2e test project names
const TEST_PROJECT_PREFIXES = [
  'E2E Canvas',
  'E2E Test',
  'Multi-Tab Test',
  'Multi-Card Test',
  'Update Test',
  'List Test',
  'Rename Test',
  'Renamed Project',
  'Delete Test',
  'Smoke Canvas',
  'Smoke Project',
  'Deploy Test',
  'AI Test',
  'Test Project',
];

async function globalTeardown(_config: FullConfig) {
  try {
    // Get auth token
    const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const { token } = await loginRes.json();
    if (!token) return;

    // List all projects
    const listRes = await fetch(`${BACKEND_URL}/canvas/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const projects = await listRes.json();
    if (!Array.isArray(projects)) return;

    // Delete test projects
    const testProjects = projects.filter((p: any) =>
      TEST_PROJECT_PREFIXES.some((prefix) => p.name?.startsWith(prefix)),
    );

    for (const project of testProjects) {
      await fetch(`${BACKEND_URL}/canvas/projects/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId: project.id }),
      });
    }

    if (testProjects.length > 0) {
      console.log(`[global-teardown] Cleaned up ${testProjects.length} test projects`);
    }
  } catch {
    // Best-effort cleanup — don't fail the test run
  }
}

export default globalTeardown;
