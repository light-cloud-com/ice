#!/usr/bin/env node
/**
 * Per-package ESLint runner.
 *
 * Linting all of `packages/*\/src services/*\/src apps/*\/src` in one
 * ESLint process loads ~2,100 files into memory and OOMs even at 12 GB
 * heap (eslint-plugin-import-x walks the import graph for every file).
 * This script spawns one ESLint process per src directory in parallel,
 * caps per-process memory at 4 GB, and aggregates exit codes — bounded
 * memory, faster wall time, isolated per-package failures.
 *
 * Forwards every arg through to each eslint invocation (so `--fix`,
 * `--quiet`, etc. all work). Always passes `--cache` so re-runs only
 * touch changed files.
 *
 * Usage:
 *   node tools/lint-packages.mjs            # check
 *   node tools/lint-packages.mjs --fix      # auto-fix
 */

import { spawn } from 'node:child_process';
import { globSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const targets = [
  ...globSync('packages/*/src', { cwd: repoRoot }),
  ...globSync('services/*/src', { cwd: repoRoot }),
  ...globSync('apps/*/src', { cwd: repoRoot }),
].sort();

if (targets.length === 0) {
  console.error('No src directories found.');
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const eslintBin = path.join(repoRoot, 'node_modules', '.bin', 'eslint');

const MAX_PARALLEL = Number(process.env.LINT_CONCURRENCY) || 4;
const MEMORY_MB = Number(process.env.LINT_MEM_MB) || 4096;

async function runOne(target) {
  const cacheLocation = path.join(repoRoot, 'node_modules', '.cache', `eslint-${target.replace(/\//g, '_')}`);
  const args = [
    '--cache',
    '--cache-location',
    cacheLocation,
    ...extraArgs,
    target,
  ];
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(eslintBin, args, {
      cwd: repoRoot,
      env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${MEMORY_MB}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('close', (code) => {
      const ms = Date.now() - start;
      resolve({ target, code: code ?? 0, stdout, stderr, ms });
    });
  });
}

async function runWithLimit(items, limit, worker) {
  const results = [];
  const queue = [...items];
  const inflight = new Set();
  while (queue.length || inflight.size) {
    while (inflight.size < limit && queue.length) {
      const item = queue.shift();
      const p = worker(item).then((r) => {
        results.push(r);
        inflight.delete(p);
      });
      inflight.add(p);
    }
    if (inflight.size) await Promise.race(inflight);
  }
  return results;
}

const results = await runWithLimit(targets, MAX_PARALLEL, runOne);
results.sort((a, b) => a.target.localeCompare(b.target));

let totalErrors = 0;
for (const r of results) {
  if (r.stdout.trim()) process.stdout.write(r.stdout);
  if (r.stderr.trim()) process.stderr.write(r.stderr);
  if (r.code !== 0) totalErrors += 1;
  console.log(`${r.code === 0 ? '✓' : '✗'} ${r.target} (${(r.ms / 1000).toFixed(1)}s)`);
}

process.exit(totalErrors > 0 ? 1 : 0);
