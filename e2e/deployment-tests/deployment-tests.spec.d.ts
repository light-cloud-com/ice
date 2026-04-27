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
export {};
