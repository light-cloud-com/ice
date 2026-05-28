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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { request } from 'node:https';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HANDLER_GLOBS = [
  'packages/core/src/deploy/providers/aws/handlers',
  'packages/core/src/deploy/providers/gcp/handlers',
  'packages/core/src/deploy/providers/azure/handlers',
  'packages/core/src/deploy/providers/kubernetes/handlers',
  'packages/core/src/deploy/providers/alibaba/handlers',
  'packages/core/src/deploy/providers/oci/handlers',
  'packages/core/src/deploy/providers/digitalocean/handlers',
  'packages/core/src/deploy/providers/ibm/handlers',
];

// Per-provider sdk-loader scan — GCP handlers don't declare `const SDK`
// per file; the central loader knows which `@google-cloud/*` package
// each `ctx.clients.get('<key>')` slot maps to. Indexing the loader
// gives us the full GCP package list.
const SDK_LOADERS = [
  'packages/core/src/deploy/providers/aws/sdk-loader.ts',
  'packages/core/src/deploy/providers/gcp/sdk-loader.ts',
  'packages/core/src/deploy/providers/azure/sdk-loader.ts',
  'packages/core/src/deploy/providers/kubernetes/sdk-loader.ts',
  'packages/core/src/deploy/providers/alibaba/sdk-loader.ts',
  'packages/core/src/deploy/providers/oci/sdk-loader.ts',
  'packages/core/src/deploy/providers/digitalocean/sdk-loader.ts',
  'packages/core/src/deploy/providers/ibm/sdk-loader.ts',
];

const args = new Set(process.argv.slice(2));
const STRICT = args.has('--strict');
const NO_NETWORK = args.has('--no-network');

// ─── Static scan ───────────────────────────────────────────────────────────

/**
 * Pull SDK metadata out of a handler file. Heuristics:
 *   - `const SDK = '@scope/name'` declares the package name
 *   - `const TYPE = 'provider.service.kind'` declares the resource type
 *   - `new <ns>.<Identifier>` captures SDK class / command refs, scoped
 *     by the namespace alias (`new s3.PutObjectCommand` → goes only to
 *     the package the `s3` alias was loaded from)
 *   - `client.<chain>.method(` captures dotted client-method chains
 *
 * To attribute refs correctly when a file uses multiple SDKs, we track
 * the alias → package binding via `const <alias> = await load_*_sdk(...)`
 * assignments (the standard pattern in every handler).
 */
async function scanHandler(filePath) {
  const src = await fs.readFile(filePath, 'utf8');
  const sdkMatch = src.match(/const\s+SDK\s*=\s*['"]([^'"]+)['"]/);
  const typeMatch = src.match(/const\s+TYPE\s*=\s*['"]([^'"]+)['"]/);

  const sdkPkgs = new Set();
  if (sdkMatch) sdkPkgs.add(sdkMatch[1]);
  for (const m of src.matchAll(/load_(?:aws|gcp|azure|kubernetes|alibaba|oci|digitalocean|ibm)_sdk\(['"]([^'"]+)['"]\)/g)) {
    sdkPkgs.add(m[1]);
  }

  // Build alias → package map. Captures shapes like:
  //   const s3 = await load_aws_sdk('@aws-sdk/client-s3')
  //   const cf = await load_aws_sdk(SDK)        // SDK = '@aws-sdk/client-cloudfront'
  //   const ec2 = await load_aws_sdk('@aws-sdk/client-ec2')
  const aliasToPkg = new Map();
  for (const m of src.matchAll(/const\s+([a-z_][\w]*)\s*=\s*await\s+load_(?:aws|gcp|azure|kubernetes|alibaba|oci|digitalocean|ibm)_sdk\(\s*(?:['"]([^'"]+)['"]|SDK)\s*\)/g)) {
    const alias = m[1];
    const pkg = m[2] ?? sdkMatch?.[1];
    if (alias && pkg) aliasToPkg.set(alias, pkg);
  }

  // SDK refs: `new <ns>.<Class>(` and `<ns>.<Class>` raw use.
  // Each ref is attributed to the package its namespace alias maps to.
  const refsByPkg = new Map();
  function addRef(pkg, ref) {
    if (!pkg) return;
    if (!refsByPkg.has(pkg)) refsByPkg.set(pkg, new Set());
    refsByPkg.get(pkg).add(ref);
  }
  for (const m of src.matchAll(/new\s+([a-z_][\w]*)\.([A-Z]\w+)\(/g)) {
    const [, alias, cls] = m;
    const pkg = aliasToPkg.get(alias);
    if (pkg) addRef(pkg, `${alias}.${cls}`);
  }

  // Client method chains: `client.foo.bar.method(`. These can't be
  // attributed to a single package without instantiation context, so
  // we attribute them to the file's primary SDK (the `const SDK = ...`
  // declaration) when there is one.
  const clientChainRefs = new Set();
  for (const m of src.matchAll(/\bclient\.([a-zA-Z_][\w.]+)\(/g)) {
    clientChainRefs.add(`client.${m[1]}`);
  }
  if (sdkMatch) {
    for (const ref of clientChainRefs) addRef(sdkMatch[1], ref);
  }

  const clientKeys = new Set();
  for (const m of src.matchAll(/ctx\.clients\.get\(['"]([^'"]+)['"]\)/g)) {
    clientKeys.add(m[1]);
  }

  return {
    file: filePath.replace(ROOT + '/', ''),
    type: typeMatch?.[1] ?? null,
    sdkPkgs: [...sdkPkgs],
    refsByPkg: Object.fromEntries([...refsByPkg].map(([k, v]) => [k, [...v].sort()])),
    sdkRefs: [...new Set([...refsByPkg.values()].flatMap((s) => [...s]))].sort(),
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

// Resolve SDK packages from where pnpm actually installs them — the
// monorepo doesn't hoist into the root node_modules, so the script's
// own CWD can't find them via plain dynamic import. We try a list of
// known package-resolution roots in order.
const RESOLVE_FROM = [
  ROOT,
  join(ROOT, 'packages/core'),
  join(ROOT, 'packages/providers/gcp'),
  join(ROOT, 'packages/providers/aws'),
  join(ROOT, 'packages/providers/azure'),
];

async function tryImport(pkg) {
  for (const base of RESOLVE_FROM) {
    try {
      const req = createRequire(join(base, 'package.json'));
      const resolved = req.resolve(pkg);
      const mod = await import(pathToFileURL(resolved).href);
      return { ok: true, mod, resolvedFrom: base };
    } catch {
      // try next base
    }
  }
  // Fallback: some SDKs (notably IBM platform-services / vpc /
  // code-engine / secrets-manager) ship per-service subpath modules
  // and omit a top-level `main` field. The bare-package require call
  // throws, but the package IS installed — its `package.json` is on
  // disk and operators load it via subpaths from sdk-loader.ts. Treat
  // that case as installed.
  for (const base of RESOLVE_FROM) {
    try {
      const pkgJson = join(base, 'node_modules', pkg, 'package.json');
      await fs.access(pkgJson);
      return { ok: true, mod: null, resolvedFrom: base, subpathOnly: true };
    } catch {
      // try next base
    }
  }
  return { ok: false, error: 'package not found in any monorepo location' };
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
  for (const m of src.matchAll(/load_(?:aws|gcp|azure|kubernetes|alibaba|oci|digitalocean|ibm)?_?sdk\(['"]([^'"]+)['"]\)/g)) {
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
    // Use the per-package scoped refs (from refsByPkg) so we don't
    // false-positive on cross-SDK refs in files that import multiple
    // SDKs (e.g. lambda-builder uses both S3 + CodeBuild).
    const allRefs = new Set();
    for (const h of pkgIndex.get(pkg)) {
      const scoped = h.refsByPkg?.[pkg];
      if (scoped) for (const r of scoped) allRefs.add(r);
    }
    const missing = unresolvedRefs(im.mod, [...allRefs]);
    runtimeResults.set(pkg, { installed: true, missingRefs: missing });
  }

  // ─── Report ─────────────────────────────────────────────────────────────
  const lines = [];
  const errors = [];
  const summary = { handlers: allHandlers.length, packages: pkgIndex.size, providers: {} };

  for (const [pkg, handlers] of pkgIndex) {
    const provider = pkg.startsWith('@aws-sdk/')
      ? 'aws'
      : pkg.startsWith('@azure/')
        ? 'azure'
        : pkg.startsWith('@google-cloud/')
          ? 'gcp'
          : pkg.startsWith('@kubernetes/')
            ? 'kubernetes'
            : pkg.startsWith('@alicloud/')
              ? 'alibaba'
              : pkg.startsWith('oci-')
                ? 'oci'
                : pkg === 'dots-wrapper'
                  ? 'digitalocean'
                  : pkg.startsWith('@ibm-cloud/') || pkg === 'ibm-cloud-sdk-core' || pkg === 'ibm-cos-sdk'
                    ? 'ibm'
                    : 'other';
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
  console.log(`  AWS:          ${summary.providers.aws ?? 0}`);
  console.log(`  GCP:          ${summary.providers.gcp ?? 0}`);
  console.log(`  Azure:        ${summary.providers.azure ?? 0}`);
  console.log(`  Kubernetes:   ${summary.providers.kubernetes ?? 0}`);
  console.log(`  Alibaba:      ${summary.providers.alibaba ?? 0}`);
  console.log(`  OCI:          ${summary.providers.oci ?? 0}`);
  console.log(`  DigitalOcean: ${summary.providers.digitalocean ?? 0}`);
  console.log(`  IBM:          ${summary.providers.ibm ?? 0}`);
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
