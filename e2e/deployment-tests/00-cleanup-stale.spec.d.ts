/**
 * Pre-test cleanup — wipes leftover projects from previous test runs so
 * each round of `pnpm test:scenarios` starts from a clean slate.
 *
 * Runs first because of the leading `00-` prefix (Playwright executes
 * spec files in alphabetical order within a project). Naming change here
 * affects ordering — keep the prefix.
 *
 * For every project that's not the org folder ("Acme"):
 *   1. Open canvas, click destroy → destroy-everything → confirm.
 *      Any orphaned GCP resources still tagged ICE get removed too.
 *   2. Delete the project DB row via the canvas API.
 *
 * Both steps are best-effort: if either fails, log and continue. We don't
 * want a flaky cleanup to block the actual scenario tests from running.
 */
export {};
