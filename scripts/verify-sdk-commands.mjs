#!/usr/bin/env node
/**
 * SDK command-input verification — fourth layer of confidence beyond
 * `verify-sdk-coverage.mjs`. This script answers the harder question:
 *
 *   "When a handler does `new s3.PutObjectCommand({ Bucket, Key, Body })`,
 *    are `Bucket`, `Key`, `Body` actually valid input fields on
 *    PutObjectRequest? Or did someone typo `Buckt:` and ship it?"
 *
 * Approach:
 *
 *   1. Walk every handler under `packages/core/src/deploy/providers/`.
 *   2. For each `new <ns>.<Cmd>({ <field1>: ..., <field2>: ... })`
 *      invocation, extract the field names the handler passes.
 *   3. Resolve <ns> → SDK package via the same alias-binding rules
 *      verify-sdk-coverage.mjs uses.
 *   4. Read the SDK's TypeScript .d.ts and locate the `<Cmd>Request`
 *      / `<Cmd>CommandInput` interface — extract its declared field
 *      names.
 *   5. Diff: report any handler-passed field not present in the SDK
 *      input interface. Those are real bugs (typos / removed fields).
 *
 * AWS SDK v3 input types live at `<pkg>/dist-types/models/*.d.ts`,
 * named `<Cmd>Request` (the SDK aliases <Cmd>CommandInput to the
 * Request interface). Azure ARM SDKs and GCP @google-cloud SDKs are
 * structured differently — this verifier focuses on AWS v3 today and
 * reports unsupported handler families as warnings.
 *
 * Exit non-zero on any mismatch (so this is suitable as a CI gate).
 *
 * Run: `node scripts/verify-sdk-commands.mjs [--verbose]`
 */

import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HANDLER_DIRS = [
  'packages/core/src/deploy/providers/aws/handlers',
  'packages/core/src/deploy/providers/gcp/handlers',
  'packages/core/src/deploy/providers/azure/handlers',
];

const args = new Set(process.argv.slice(2));
const VERBOSE = args.has('--verbose');

const require_core = createRequire(join(ROOT, 'packages/core/package.json'));

// ─── Handler scan ──────────────────────────────────────────────────────────

/**
 * Extract handler invocations of shape `new <ns>.<Cmd>({...})` with the
 * literal-key field names. Returns one record per call site.
 */
function scanInvocations(src) {
  const invocations = [];
  // Match `new <alias>.<Cmd>(` and the following balanced-brace object literal.
  const re = /new\s+([a-z_][\w]*)\.([A-Z]\w+)Command\(\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const [, alias, cmdShort] = m;
    const cmd = `${cmdShort}Command`;
    const objStart = m.index + m[0].length - 1; // points at the `{`
    // Walk forward to find the matching `}` (one level of depth, no nested).
    let depth = 1;
    let i = objStart + 1;
    let inStr = null;
    let escape = false;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (inStr) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === inStr) inStr = null;
      } else {
        if (c === '"' || c === "'" || c === '`') inStr = c;
        else if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      i++;
    }
    const body = src.slice(objStart, i);
    // Extract top-level keys: `<Identifier>:` at the start of a line
    // or after `{` / `,`. Skip string/template-literal contents.
    const keys = new Set();
    const keyRe = /(?:^|[{,]\s*)\s*([A-Za-z_][\w]*)\s*:/gm;
    let km;
    // Strip nested braces so we only see top-level keys.
    let depth2 = 0;
    const stripped = [];
    let inStr2 = null;
    let esc2 = false;
    for (const c of body) {
      if (inStr2) {
        if (esc2) esc2 = false;
        else if (c === '\\') esc2 = true;
        else if (c === inStr2) inStr2 = null;
        stripped.push(c);
      } else {
        if (c === '"' || c === "'" || c === '`') {
          inStr2 = c;
          stripped.push(c);
        } else if (c === '{') {
          depth2++;
          stripped.push(depth2 > 1 ? ' ' : c);
        } else if (c === '}') {
          stripped.push(depth2 > 1 ? ' ' : c);
          depth2--;
        } else {
          stripped.push(depth2 > 1 ? ' ' : c);
        }
      }
    }
    const top = stripped.join('');
    while ((km = keyRe.exec(top))) keys.add(km[1]);
    invocations.push({ alias, cmd, keys: [...keys].sort() });
  }
  return invocations;
}

function extractAliasMap(src) {
  // Parallel to verify-sdk-coverage.mjs — `const <alias> = await
  // load_aws_sdk('<pkg>')` (or `SDK` referring to a `const SDK = ...`).
  const aliasToPkg = new Map();
  const sdkConst = src.match(/const\s+SDK\s*=\s*['"]([^'"]+)['"]/)?.[1];
  for (const m of src.matchAll(/const\s+([a-z_][\w]*)\s*=\s*await\s+load_(?:aws|gcp|azure)_sdk\(\s*(?:['"]([^'"]+)['"]|SDK)\s*\)/g)) {
    const alias = m[1];
    const pkg = m[2] ?? sdkConst;
    if (alias && pkg) aliasToPkg.set(alias, pkg);
  }
  return aliasToPkg;
}

async function walkHandlersDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// ─── SDK input-shape extraction ─────────────────────────────────────────────

const cache = new Map();
async function listModelFiles(pkg) {
  if (cache.has(pkg)) return cache.get(pkg);
  let dir;
  try {
    const entry = require_core.resolve(`${pkg}/package.json`);
    dir = join(dirname(entry), 'dist-types/models');
  } catch {
    cache.set(pkg, []);
    return [];
  }
  let files = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    files = [];
  }
  const out = [];
  for (const f of files) {
    if (f.endsWith('.d.ts')) out.push(join(dir, f));
  }
  cache.set(pkg, out);
  return out;
}

/**
 * Find the `<Cmd>Request` interface in any of the SDK's models_*.d.ts
 * files and return the set of declared field names.
 *
 * AWS v3 convention: `interface <Cmd>Request { Field1: …; Field2: …; }`
 * for input, `interface <Cmd>Response` for output. Some commands use
 * the suffix-less form (e.g. `interface CreateProjectInput`).
 */
const interfaceCache = new Map();
async function getCommandInputFields(pkg, cmdShort) {
  const cacheKey = `${pkg}::${cmdShort}`;
  if (interfaceCache.has(cacheKey)) return interfaceCache.get(cacheKey);

  // AWS v3 input interface name varies by protocol:
  //   - JSON/REST services use `<Cmd>Request` (most)
  //   - JSON services with the Smithy generator use `<Cmd>Input` (some)
  //   - Query protocol services (RDS, DocDB, ElastiCache, Redshift,
  //     IAM, EC2, etc.) use `<Cmd>Message`
  //   - The Smithy default also exports `<Cmd>CommandInput` as an alias
  const candidates = [
    `${cmdShort}Request`,
    `${cmdShort}Message`,
    `${cmdShort}Input`,
    `${cmdShort}CommandInput`,
  ];
  const files = await listModelFiles(pkg);
  for (const file of files) {
    const src = await fs.readFile(file, 'utf8');
    for (const candidate of candidates) {
      const re = new RegExp(`export\\s+interface\\s+${candidate}\\s*(?:extends\\s+[^{]+)?\\{([\\s\\S]*?)\\n\\}`, 'm');
      const m = src.match(re);
      if (m) {
        const body = m[1];
        const fields = new Set();
        for (const fm of body.matchAll(/^\s*([A-Za-z_][\w]*)\??\s*:/gm)) {
          fields.add(fm[1]);
        }
        interfaceCache.set(cacheKey, { found: true, fields: [...fields], interface: candidate, file });
        return interfaceCache.get(cacheKey);
      }
    }
  }
  interfaceCache.set(cacheKey, { found: false });
  return interfaceCache.get(cacheKey);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const handlers = [];
  for (const rel of HANDLER_DIRS) {
    try {
      const files = await walkHandlersDir(join(ROOT, rel));
      handlers.push(...files);
    } catch (e) {
      console.error(`Skipping ${rel}: ${e.message}`);
    }
  }

  const summary = {
    handlersScanned: 0,
    invocationsScanned: 0,
    awsVerified: 0,
    awsUnverified: 0, // SDK not AWS or interface not found
    mismatches: [],
  };

  for (const file of handlers) {
    const src = await fs.readFile(file, 'utf8');
    const aliasMap = extractAliasMap(src);
    const invocations = scanInvocations(src);
    if (invocations.length === 0) continue;
    summary.handlersScanned++;

    for (const inv of invocations) {
      summary.invocationsScanned++;
      const pkg = aliasMap.get(inv.alias);
      if (!pkg) {
        if (VERBOSE) console.log(`  ${file.replace(ROOT + '/', '')}: ${inv.alias}.${inv.cmd} → unknown alias`);
        summary.awsUnverified++;
        continue;
      }
      if (!pkg.startsWith('@aws-sdk/')) {
        // Azure / GCP — different shape lookups. Reported as unverified
        // (not a failure). A future enhancement extracts Azure ARM
        // operation Parameters specs and GCP grpc request types.
        summary.awsUnverified++;
        if (VERBOSE)
          console.log(`  ${file.replace(ROOT + '/', '')}: ${inv.cmd} from ${pkg} → non-AWS SDK, skipped`);
        continue;
      }
      const cmdShort = inv.cmd.replace(/Command$/, '');
      const result = await getCommandInputFields(pkg, cmdShort);
      if (!result.found) {
        summary.awsUnverified++;
        if (VERBOSE)
          console.log(
            `  ${file.replace(ROOT + '/', '')}: ${inv.cmd} in ${pkg} → interface not found, skipped`,
          );
        continue;
      }
      const validSet = new Set(result.fields);
      const unknown = inv.keys.filter((k) => !validSet.has(k));
      summary.awsVerified++;
      if (unknown.length) {
        summary.mismatches.push({
          file: file.replace(ROOT + '/', ''),
          command: inv.cmd,
          package: pkg,
          inputInterface: result.interface,
          unknownKeys: unknown,
          passed: inv.keys,
          validKeys: result.fields,
        });
      }
    }
  }

  console.log('=== SDK command-input verification ===');
  console.log(`Handlers scanned:    ${summary.handlersScanned}`);
  console.log(`Invocations scanned: ${summary.invocationsScanned}`);
  console.log(`AWS verified:        ${summary.awsVerified}`);
  console.log(`AWS unverified:      ${summary.awsUnverified} (Azure/GCP SDKs use different type layouts)`);
  console.log('');

  if (summary.mismatches.length === 0) {
    console.log('✓ Every AWS command-input field the handlers pass exists in the SDK\'s declared input interface.');
    process.exit(0);
  }

  console.log(`✗ ${summary.mismatches.length} mismatch(es):`);
  for (const m of summary.mismatches) {
    console.log(`\n  ${m.file}`);
    console.log(`    ${m.command} (${m.package} → ${m.inputInterface})`);
    console.log(`    Handler passes: ${m.passed.join(', ')}`);
    console.log(`    Unknown:        ${m.unknownKeys.join(', ')}`);
    if (VERBOSE) console.log(`    SDK accepts:    ${m.validKeys.slice(0, 12).join(', ')}${m.validKeys.length > 12 ? ' …' : ''}`);
  }

  const outPath = join(ROOT, 'e2e/sdk-command-report.json');
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nFull report: ${outPath.replace(ROOT + '/', '')}`);
  process.exit(1);
}

main().catch((e) => {
  console.error('verify-sdk-commands crashed:', e);
  process.exit(2);
});
