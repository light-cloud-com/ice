/**
 * Deployment-test scenario runner — Playwright entry.
 *
 * Discovers every YAML file under scenarios/ at load time and creates one
 * test() per scenario. Filter via env var ICE_SCENARIO_ID (substring match
 * on scenario.id).
 *
 * Required env vars:
 *   ICE_TEST_GCP_PROJECT  — GCP project ID
 *   ICE_TEST_SA_KEY_PATH  — Path to SA key JSON
 *
 * Optional:
 *   ICE_TEST_GITHUB_TOKEN — for repo-based scenarios
 *   ICE_SCENARIO_ID       — substring of scenario.id to run only matches
 */

import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../fixtures/template-deploy.fixture';
import { loadScenario } from './runner/schema';
import { runScenario } from './runner/scenario-runner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCENARIOS_DIR = join(__dirname, 'scenarios');
const RUNS_DIR = join(__dirname, '..', '..', 'test-results', 'runs');

const FILTER = process.env.ICE_SCENARIO_ID || '';

const scenarioFiles = readdirSync(SCENARIOS_DIR)
  .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  .sort();

test.describe('Deployment-test scenarios', () => {
  test.skip(!process.env.ICE_TEST_GCP_PROJECT, 'ICE_TEST_GCP_PROJECT env var required');
  test.skip(!process.env.ICE_TEST_SA_KEY_PATH, 'ICE_TEST_SA_KEY_PATH env var required');

  for (const file of scenarioFiles) {
    const path = join(SCENARIOS_DIR, file);
    let scenario: ReturnType<typeof loadScenario>['scenario'];
    try {
      scenario = loadScenario(path).scenario;
    } catch (err) {
      // Surface load errors as a failing test for visibility.
      test(`[load-error] ${file}`, () => {
        throw err;
      });
      continue;
    }

    if (FILTER && !scenario.id.includes(FILTER)) continue;

    test(`${scenario.id} — ${scenario.name}`, async ({ page, templateDeploy }) => {
      const result = await runScenario({
        page,
        fixture: templateDeploy,
        scenario,
        rootDir: RUNS_DIR,
      });
      console.log(`[scenario-runner] ${scenario.id} → ${result.status} (${result.runDir})`);
      expect(result.status, `scenario ${scenario.id} failed; see ${result.runDir}/events.jsonl`).toBe('pass');
    });
  }
});
