#!/usr/bin/env node
/**
 * Live-test runner wrapper.
 *
 * Usage:
 *   node scripts/run-live-tests.mjs <provider> [filter1] [filter2] [...vitest-args]
 *
 * Positional filters are substring-matched against the test file name.
 * Anything starting with `--` or `-` is passed through to vitest.
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
  console.error('Usage: pnpm test:live:<aws|azure> [filter1] [filter2] [...vitest-args]');
  process.exit(1);
}

const provider = args[0];
if (provider !== 'aws' && provider !== 'azure') {
  console.error(`Unknown provider: ${provider} (expected 'aws' or 'azure')`);
  process.exit(1);
}

const filters = [];
const passthrough = [];
for (const arg of args.slice(1)) {
  if (arg.startsWith('-')) {
    passthrough.push(arg);
  } else {
    filters.push(arg);
  }
}

const baseDir = 'packages/core/src/deploy/providers/__tests__/live';
const includePatterns =
  filters.length === 0
    ? [`${baseDir}/${provider}-*.live.test.ts`]
    : filters.map((f) => `${baseDir}/${provider}-*${f}*.live.test.ts`);

const vitestArgs = ['exec', 'vitest', 'run', '--root', '.'];
for (const pattern of includePatterns) {
  vitestArgs.push('--include', pattern);
}
vitestArgs.push(...passthrough);

const result = spawnSync('pnpm', vitestArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
