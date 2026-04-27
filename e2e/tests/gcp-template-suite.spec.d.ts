/**
 * GCP Template Integration Suite
 *
 * Tests all (or selected) ICE templates against real GCP infrastructure.
 * Each template is deployed via the UI and verified via gcloud CLI.
 *
 * Required env vars:
 *   ICE_TEST_GCP_PROJECT  — GCP project ID
 *   ICE_TEST_SA_KEY_PATH  — Path to service account key JSON
 *
 * Optional env vars:
 *   ICE_TEST_GCP_REGION   — GCP region (default: us-central1)
 *   ICE_TEST_TEMPLATES    — Comma-separated template IDs, @category, or #difficulty
 */
export {};
