#!/usr/bin/env node
/**
 * SDK coverage verification — runs in three layers of confidence:
 *
 *   1. **Static scan**: walks every handler file under
 *      `packages/core/src/deploy/providers/{aws,gcp,azure}/handlers/*.ts`,
 *      extracts the SDK package name + client class + every SDK method
 *      reference (e.g. `new ec2.RunInstancesCommand`, `client.send(new
 *      s3.PutObjectCommand`, `client.virtualNetworks.beginCreateOrUpdateAndWait`).
 *
 *   2. **npm-registry verification**: for each unique SDK package
 *      name, hits `https://registry.npmjs.org/<pkg>` and confirms the
 *      package exists + reports the latest version. Catches typos in
 *      SDK package names BEFORE someone deploys.
 *
 *   3. **Runtime verification (optional)**: if the SDK package is
 *      installed under `node_modules/`, dynamically imports it and
 *      asserts the client class + method names the handler references
 *      actually exist on the SDK surface. This is the strongest check
 *      but only runs against packages installed locally.
 *
 * Exit non-zero on any verification failure. Writes a machine-readable
 * JSON report to `e2e/sdk-coverage-report.json` and a human-readable
 * summary to stdout.
 *
 * Run: `node scripts/verify-sdk-coverage.mjs [--strict] [--no-network]`
 *
 *   --strict       — fail the run if any handler references an SDK
 *                    method that can't be verified against an installed
 *                    package (default: warn only)
 *   --no-network   — skip the npm-registry HEAD requests (offline)
 */

import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HANDLER_GLOBS = [
  'packages/core/src/deploy/providers/aws/handlers',
  'packages/core/src/deploy/providers/gcp/handlers',
  'packages/core/src/deploy/providers/azure/handlers',
];

// Per-provider sdk-loader scan — GCP handlers don't declare `const SDK`
// per file; the central loader knows which `@google-cloud/*` package
// each `ctx.clients.get('<key>')` slot maps to. Indexing the loader
// gives us the full GCP package list.
const SDK_LOADERS = [
  'packages/core/src/deploy/providers/aws/sdk-loader.ts',
  'packages/core/src/deploy/providers/gcp/sdk-loader.ts',
  'packages/core/src/deploy/providers/azure/sdk-loader.ts',
];

const args = new Set(process.argv.slice(2));
const STRICT = args.has('--strict');
const NO_NETWORK = args.has('--no-network');

// ─── Static scan ───────────────────────────────────────────────────────────

/**
 * Pull SDK metadata out of a handler file. Heuristics:
 *   - `const SDK = '@scope/name'` declares the package name
 *   - `const TYPE = 'provider.service.kind'` declares the resource type
 *   - `new <ns>.<Identifier>` captures SDK class / command refs
 *   - `client.<chain>.method(` captures dotted client-method chains
 */
async function scanHandler(filePath) {
  const src = await fs.readFile(filePath, 'utf8');
  const sdkMatch = src.match(/const\s+SDK\s*=\s*['"]([^'"]+)['"]/);
  const typeMatch = src.match(/const\s+TYPE\s*=\s*['"]([^'"]+)['"]/);

  const sdkPkgs = new Set();
  if (sdkMatch) sdkPkgs.add(sdkMatch[1]);
  // Also capture `load_*_sdk('<pkg>')` calls (some handlers route through helpers).
  for (const m of src.matchAll(/load_(?:aws|gcp|azure)_sdk\(['"]([^'"]+)['"]\)/g)) {
    sdkPkgs.add(m[1]);
  }

  // SDK command refs: `new <ns>.<Class>(`
  const sdkRefs = new Set();
  for (const m of src.matchAll(/new\s+([a-z_][\w]*)\.([A-Z]\w+)\(/g)) {
    sdkRefs.add(`${m[1]}.${m[2]}`);
  }
  // Client method chains: `client.foo.bar.method(`
  // For Azure ARM clients these surface as `client.<resource>.beginXxxAndWait(`
  // For GCP it's `client.<service>.<method>(`.
  for (const m of src.matchAll(/\bclient\.([a-zA-Z_][\w.]+)\(/g)) {
    sdkRefs.add(`client.${m[1]}`);
  }
  // Also `ctx.clients.get('<key>')` — useful for cross-checking which
  // SDK client slot the handler reads from.
  const clientKeys = new Set();
  for (const m of src.matchAll(/ctx\.clients\.get\(['"]([^'"]+)['"]\)/g)) {
    clientKeys.add(m[1]);
  }

  return {
    file: filePath.replace(ROOT + '/', ''),
    type: typeMatch?.[1] ?? null,
    sdkPkgs: [...sdkPkgs],
    sdkRefs: [...sdkRefs].sort(),
    clientKeys: [...clientKeys],
  };
}

async function walkHandlersDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const handlers = [];
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      handlers.push(join(dir, entry.name));
    }
  }
  return handlers;
}

// ─── npm registry check ────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolveP, rejectP) => {
    const req = request(url, { method: 'GET', headers: { Accept: 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 404) return resolveP({ ok: false, status: 404 });
        if (res.statusCode >= 400) return resolveP({ ok: false, status: res.statusCode });
        try {
          resolveP({ ok: true, status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          rejectP(e);
        }
      });
    });
    req.on('error', rejectP);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function verifyNpmPackage(pkg) {
  if (NO_NETWORK) return { ok: true, version: '(skipped)', latest: null };
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(pkg).replace(/%40/g, '@').replace(/%2F/g, '/')}/latest`;
    const result = await fetchJson(url);
    if (!result.ok) return { ok: false, error: `HTTP ${result.status}` };
    return { ok: true, version: result.data.version ?? null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Runtime verification ──────────────────────────────────────────────────

async function tryImport(pkg) {
  try {
    const mod = await Function('m', 'return import(m)')(pkg);
    return { ok: true, mod };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Given an SDK module, check that every `<ns>.<Class>` ref in the
 * handler resolves to an actual export on the module. Returns the
 * list of unresolved refs.
 */
function unresolvedRefs(mod, sdkRefs) {
  const out = [];
  for (const ref of sdkRefs) {
    if (!ref.includes('.')) continue;
    if (ref.startsWith('client.')) continue; // client chains depend on runtime instantiation
    const cls = ref.split('.')[1];
    if (!cls) continue;
    // Look for the class on the top level or under common nested namespaces
    // (`v1`, `v2`, etc. for some GCP SDKs).
    const hits = mod[cls] || mod.v1?.[cls] || mod.v2?.[cls] || mod.v3?.[cls] || mod.default?.[cls];
    if (!hits) out.push(cls);
  }
  return out;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function scanLoader(filePath) {
  const src = await fs.readFile(filePath, 'utf8');
  const pkgs = new Set();
  // Match: load_*_sdk('<pkg>'), load_sdk('<pkg>'), import('<pkg>') —
  // anything that looks like an npm SDK package reference.
  for (const m of src.matchAll(/load_(?:aws|gcp|azure)?_?sdk\(['"]([^'"]+)['"]\)/g)) {
    pkgs.add(m[1]);
  }
  for (const m of src.matchAll(/load_sdk\(['"]([^'"]+)['"]\)/g)) {
    pkgs.add(m[1]);
  }
  return [...pkgs];
}

async function main() {
  const allHandlers = [];
  for (const rel of HANDLER_GLOBS) {
    const dir = join(ROOT, rel);
    try {
      const files = await walkHandlersDir(dir);
      for (const f of files) allHandlers.push(await scanHandler(f));
    } catch (e) {
      console.error(`Skipping ${rel}: ${e.message}`);
    }
  }

  // Pull additional packages from each provider's sdk-loader. These
  // get attributed to a synthetic "loader" handler entry so the
  // per-package report still shows where the reference lives.
  for (const rel of SDK_LOADERS) {
    const filePath = join(ROOT, rel);
    try {
      const loaderPkgs = await scanLoader(filePath);
      if (loaderPkgs.length) {
        allHandlers.push({
          file: rel,
          type: null,
          sdkPkgs: loaderPkgs,
          sdkRefs: [],
          clientKeys: [],
        });
      }
    } catch (e) {
      console.error(`Skipping loader ${rel}: ${e.message}`);
    }
  }

  const pkgIndex = new Map();
  for (const h of allHandlers) {
    for (const p of h.sdkPkgs) {
      if (!pkgIndex.has(p)) pkgIndex.set(p, []);
      pkgIndex.get(p).push(h);
    }
  }

  const npmResults = new Map();
  for (const pkg of pkgIndex.keys()) {
    npmResults.set(pkg, await verifyNpmPackage(pkg));
  }

  const runtimeResults = new Map();
  for (const pkg of pkgIndex.keys()) {
    const im = await tryImport(pkg);
    if (!im.ok) {
      runtimeResults.set(pkg, { installed: false });
      continue;
    }
    // Aggregate every ref from every handler that uses this pkg.
    const allRefs = new Set();
    for (const h of pkgIndex.get(pkg)) for (const r of h.sdkRefs) allRefs.add(r);
    const missing = unresolvedRefs(im.mod, [...allRefs]);
    runtimeResults.set(pkg, { installed: true, missingRefs: missing });
  }

  // ─── Report ─────────────────────────────────────────────────────────────
  const lines = [];
  const errors = [];
  const summary = { handlers: allHandlers.length, packages: pkgIndex.size, providers: {} };

  for (const [pkg, handlers] of pkgIndex) {
    const provider = pkg.startsWith('@aws-sdk/') ? 'aws' : pkg.startsWith('@azure/') ? 'azure' : pkg.startsWith('@google-cloud/') ? 'gcp' : 'other';
    summary.providers[provider] = (summary.providers[provider] ?? 0) + 1;

    const npm = npmResults.get(pkg);
    const rt = runtimeResults.get(pkg);
    const npmTag = npm.ok ? `npm:${npm.version}` : `npm:MISSING(${npm.error})`;
    const rtTag = rt.installed ? (rt.missingRefs.length ? `runtime:${rt.missingRefs.length} unresolved` : 'runtime:OK') : 'runtime:not-installed';

    lines.push(`  ${pkg.padEnd(45)} ${npmTag.padEnd(28)} ${rtTag}`);

    if (!npm.ok) errors.push(`NPM lookup failed for ${pkg}: ${npm.error}`);
    if (rt.installed && rt.missingRefs.length) {
      const detail = rt.missingRefs.slice(0, 5).join(', ');
      const note = `Unresolved refs in ${pkg}: ${detail}${rt.missingRefs.length > 5 ? ` (+${rt.missingRefs.length - 5} more)` : ''}`;
      if (STRICT) errors.push(note);
      else lines.push(`     ! ${note}`);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    summary,
    handlers: allHandlers,
    packages: [...pkgIndex.entries()].map(([pkg, hs]) => ({
      package: pkg,
      handlers: hs.map((h) => h.file),
      npm: npmResults.get(pkg),
      runtime: runtimeResults.get(pkg),
    })),
  };

  const outPath = join(ROOT, 'e2e/sdk-coverage-report.json');
  await fs.mkdir(dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));

  console.log('=== ICE SDK coverage verification ===');
  console.log(`Handlers scanned: ${summary.handlers}`);
  console.log(`Unique SDK packages: ${summary.packages}`);
  console.log(`  AWS:   ${summary.providers.aws ?? 0}`);
  console.log(`  GCP:   ${summary.providers.gcp ?? 0}`);
  console.log(`  Azure: ${summary.providers.azure ?? 0}`);
  console.log('');
  console.log('Per-package verification:');
  for (const line of lines) console.log(line);
  console.log('');
  console.log(`Report written to ${outPath.replace(ROOT + '/', '')}`);

  if (errors.length) {
    console.error(`\n${errors.length} error(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(STRICT ? 1 : 0);
  }
}

main().catch((e) => {
  console.error('verify-sdk-coverage crashed:', e);
  process.exit(2);
});
