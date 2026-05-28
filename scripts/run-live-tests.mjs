#!/usr/bin/env node
/**
 * Live-test runner wrapper.
 *
 * Usage:
 *   node scripts/run-live-tests.mjs <provider> [filter1] [filter2] [...vitest-args]
 *
 * Positional filters become vitest positional filters (substring-matched
 * against the test file path). They're prefixed with the provider so
 * `pnpm test:live:aws s3` matches `aws-s3.live.test.ts`.
 *
 * Examples:
 *   pnpm test:live:aws                  # every aws-*.live.test.ts
 *   pnpm test:live:aws s3               # only aws-s3.live.test.ts
 *   pnpm test:live:aws s3 sqs dynamodb  # three handlers in one run
 *   pnpm test:live:aws s3 --reporter=verbose
 *
 * Live tests need real cloud credentials. Without them the tests skip
 * with a one-line banner explaining what to export.
 */

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(
    'Usage: pnpm test:live:<aws|azure|kubernetes|alibaba|oci|digitalocean|ibm> [filter1] [filter2] [...vitest-args]',
  );
  process.exit(1);
}

const provider = args[0];
const VALID = ['aws', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'];
if (!VALID.includes(provider)) {
  console.error(`Unknown provider: ${provider} (expected one of: ${VALID.join(', ')})`);
  process.exit(1);
}

// Kubernetes live tests use `k8s-` filename prefix (shorter than the
// dispatch type prefix), so map `kubernetes` → `k8s-`. DigitalOcean
// uses `do-` for brevity.
const FILE_PREFIX = {
  aws: 'aws',
  azure: 'azure',
  kubernetes: 'k8s',
  alibaba: 'alibaba',
  oci: 'oci',
  digitalocean: 'do',
  ibm: 'ibm',
};
const filePrefix = FILE_PREFIX[provider];

const filters = [];
const passthrough = [];
for (const arg of args.slice(1)) {
  if (arg.startsWith('-')) {
    passthrough.push(arg);
  } else {
    filters.push(arg);
  }
}

// Build positional filters. Vitest matches them as substrings against
// resolved file paths. Default to the provider prefix so an empty filter
// list still scopes to one provider's tests.
const positionals = filters.length === 0 ? [`${filePrefix}-`] : filters.map((f) => `${filePrefix}-${f}`);

const vitestArgs = ['exec', 'vitest', 'run', '--config', 'vitest.live.config.ts', '--root', '.'];
vitestArgs.push(...positionals);
vitestArgs.push(...passthrough);

const result = spawnSync('pnpm', vitestArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
