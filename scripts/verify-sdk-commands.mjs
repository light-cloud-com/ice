#!/usr/bin/env node
/**
 * SDK command-input verification — fourth layer of confidence beyond
 * `verify-sdk-coverage.mjs`. This script answers the harder question:
 *
 *   "When a handler does `new s3.PutObjectCommand({ Bucket, Key, Body })`,
 *    are `Bucket`, `Key`, `Body` actually valid input fields on
 *    PutObjectRequest? Or did someone typo `Buckt:` and ship it?"
 *
 * Approach (per provider — same diff logic, different type lookups):
 *
 *   AWS  (`@aws-sdk/client-*`): handler does `new s3.PutObjectCommand({…})`.
 *        The input interface is exported from `dist-types/models/*.d.ts`
 *        as `<Cmd>Request` (JSON/REST), `<Cmd>Message` (Query protocol),
 *        or `<Cmd>Input` (some Smithy SDKs).
 *
 *   Azure (`@azure/arm-*`):     handler does
 *        `client.<group>.<method>(rg, name, { …body })`.
 *        The method lives in `dist/{esm,react-native}/operationsInterfaces/<group>.d.ts`.
 *        The body parameter has a type like `VirtualNetwork`, which
 *        declares fields in `dist/{esm,react-native}/models/index.d.ts`.
 *        We follow `extends Resource` chains to pick up inherited
 *        fields too.
 *
 *   GCP  (`@google-cloud/*`):   handler does
 *        `client.createSecret({ parent, secretId, secret: {…} })`.
 *        The request type is `I<Method>Request` declared in
 *        `build/protos/protos.d.ts` under nested namespaces.
 *
 * Exit non-zero on any mismatch (suitable as a CI gate).
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
  'packages/core/src/deploy/providers/kubernetes/handlers',
  'packages/core/src/deploy/providers/alibaba/handlers',
  'packages/core/src/deploy/providers/oci/handlers',
  'packages/core/src/deploy/providers/digitalocean/handlers',
  'packages/core/src/deploy/providers/ibm/handlers',
];

const args = new Set(process.argv.slice(2));
const VERBOSE = args.has('--verbose');

const require_core = createRequire(join(ROOT, 'packages/core/package.json'));

// ─── Common: extract object-literal keys at a source position ───────────────

/**
 * Given the source and a starting `{` position, return the set of
 * top-level keys in the object literal. Skips nested braces and
 * string contents so nested objects' keys don't leak in.
 */
function topLevelKeys(src, openBraceIdx) {
  let depth = 1;
  let i = openBraceIdx + 1;
  let inStr = null;
  let escape = false;
  const start = i;
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
  const body = src.slice(start, i - 1);
  // Flatten nested braces to whitespace so the key regex only catches
  // top-level keys.
  let d = 0;
  let s = null;
  let e = false;
  const flat = [];
  for (const c of body) {
    if (s) {
      if (e) e = false;
      else if (c === '\\') e = true;
      else if (c === s) s = null;
      flat.push(c);
    } else if (c === '"' || c === "'" || c === '`') {
      s = c;
      flat.push(c);
    } else if (c === '{') {
      d++;
      flat.push(' ');
    } else if (c === '}') {
      flat.push(' ');
      d--;
    } else {
      flat.push(d > 0 ? ' ' : c);
    }
  }
  const top = flat.join('');
  const keys = new Set();
  for (const km of top.matchAll(/(?:^|[{,]\s*)\s*([A-Za-z_][\w]*)\s*:/gm)) keys.add(km[1]);
  return [...keys].sort();
}

// ─── Handler scan ──────────────────────────────────────────────────────────

function extractAliasMap(src) {
  const aliasToPkg = new Map();
  const sdkConst = src.match(/const\s+SDK\s*=\s*['"]([^'"]+)['"]/)?.[1];
  for (const m of src.matchAll(
    /const\s+([a-z_][\w]*)\s*=\s*await\s+load_(?:aws|gcp|azure)_sdk\(\s*(?:['"]([^'"]+)['"]|SDK)\s*\)/g,
  )) {
    const alias = m[1];
    const pkg = m[2] ?? sdkConst;
    if (alias && pkg) aliasToPkg.set(alias, pkg);
  }
  return aliasToPkg;
}

/**
 * AWS handler invocations: `new <alias>.<Cmd>Command({…})`.
 */
function scanAwsInvocations(src) {
  const out = [];
  for (const m of src.matchAll(/new\s+([a-z_][\w]*)\.([A-Z]\w+)Command\(\s*\{/g)) {
    const [, alias, cmdShort] = m;
    const objStart = m.index + m[0].length - 1;
    out.push({ provider: 'aws', alias, cmd: `${cmdShort}Command`, cmdShort, keys: topLevelKeys(src, objStart) });
  }
  return out;
}

/**
 * Azure handler invocations: `client.<group>.<method>(arg1, arg2, …,
 * { …body })`. The body object is always the last positional arg with
 * a literal `{`.
 */
function scanAzureInvocations(src, sdkPkg) {
  const out = [];
  // Match: `client.<group>.<method>(`
  // Then walk to the matching `)` capturing the last `{…}` literal.
  const re = /\bclient\.([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)\(/g;
  let m;
  while ((m = re.exec(src))) {
    const [, group, method] = m;
    const start = m.index + m[0].length;
    // Walk until matching `)`. We want the FINAL top-level object
    // literal in the arg list (Azure operation methods take
    // `(rg, name, body, options?)`). Track BOTH paren and brace
    // depth so we only record top-level `{` openings.
    let parenDepth = 1;
    let braceDepth = 0;
    let i = start;
    let inStr = null;
    let esc = false;
    let lastBraceOpen = -1;
    while (i < src.length && parenDepth > 0) {
      const c = src[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === inStr) inStr = null;
      } else if (c === '"' || c === "'" || c === '`') inStr = c;
      else if (c === '(') parenDepth++;
      else if (c === ')') parenDepth--;
      else if (c === '{') {
        if (braceDepth === 0 && parenDepth === 1) lastBraceOpen = i;
        braceDepth++;
      } else if (c === '}') braceDepth--;
      i++;
    }
    if (lastBraceOpen < 0) continue;
    out.push({
      provider: 'azure',
      sdkPkg,
      group,
      method,
      keys: topLevelKeys(src, lastBraceOpen),
    });
  }
  return out;
}

/**
 * GCP handler invocations: `client.<method>({ …request })` or
 * `client.<sub>.<method>({…})`. Each method takes a single request
 * object. We also catch destructured calls: `const [thing] = await
 * client.method({…})`.
 */
function scanGcpInvocations(src, sdkPkg) {
  const out = [];
  // Match `client.<chain>(` followed by the first `{`.
  const re = /\bclient\.([a-zA-Z_][\w.]*)\(\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const [, chain] = m;
    const objStart = m.index + m[0].length - 1;
    const method = chain.split('.').pop();
    out.push({
      provider: 'gcp',
      sdkPkg,
      method,
      keys: topLevelKeys(src, objStart),
    });
  }
  return out;
}

async function walkHandlersDir(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// ─── AWS resolver ──────────────────────────────────────────────────────────

const awsModelFilesCache = new Map();
async function awsListModelFiles(pkg) {
  if (awsModelFilesCache.has(pkg)) return awsModelFilesCache.get(pkg);
  let dir;
  try {
    const entry = require_core.resolve(`${pkg}/package.json`);
    dir = join(dirname(entry), 'dist-types/models');
  } catch {
    awsModelFilesCache.set(pkg, []);
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
  awsModelFilesCache.set(pkg, out);
  return out;
}

const awsInterfaceCache = new Map();
async function awsGetInputFields(pkg, cmdShort) {
  const cacheKey = `${pkg}::${cmdShort}`;
  if (awsInterfaceCache.has(cacheKey)) return awsInterfaceCache.get(cacheKey);
  const candidates = [
    `${cmdShort}Request`,
    `${cmdShort}Message`,
    `${cmdShort}Input`,
    `${cmdShort}CommandInput`,
  ];
  const files = await awsListModelFiles(pkg);
  for (const file of files) {
    const src = await fs.readFile(file, 'utf8');
    for (const candidate of candidates) {
      const re = new RegExp(
        `export\\s+interface\\s+${candidate}\\s*(?:extends\\s+[^{]+)?\\{([\\s\\S]*?)\\n\\}`,
        'm',
      );
      const m = src.match(re);
      if (m) {
        const fields = new Set();
        for (const fm of m[1].matchAll(/^\s*([A-Za-z_][\w]*)\??\s*:/gm)) fields.add(fm[1]);
        awsInterfaceCache.set(cacheKey, { found: true, fields: [...fields], interface: candidate });
        return awsInterfaceCache.get(cacheKey);
      }
    }
  }
  awsInterfaceCache.set(cacheKey, { found: false });
  return awsInterfaceCache.get(cacheKey);
}

// ─── Azure resolver ────────────────────────────────────────────────────────

async function walkRecursive(dir, depth = 0, max = 4, out = []) {
  if (depth > max) return out;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // Skip test/samples/coverage paths to keep the walk fast.
      if (/^(samples?|test|tests|coverage|node_modules)/.test(e.name)) continue;
      await walkRecursive(full, depth + 1, max, out);
    } else if (e.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const azureFileIndexCache = new Map();
/**
 * Build an index of every `.d.ts` file in the SDK package (limited
 * depth). Multiple files may match the same group name (e.g. in the
 * new modular SDK, `classic/registries/index.d.ts` AND
 * `api/registries/index.d.ts` both exist — `classic/` holds the
 * high-level `beginCreateAndWait` methods while `api/` holds the
 * lower-level functions). We index all of them and try each.
 */
async function azureBuildFileIndex(pkg) {
  if (azureFileIndexCache.has(pkg)) return azureFileIndexCache.get(pkg);
  const idx = { byBaseName: new Map(), allFiles: [] };
  try {
    const entry = require_core.resolve(`${pkg}/package.json`);
    const base = dirname(entry);
    const files = await walkRecursive(base, 0, 5);
    idx.allFiles = files;
    for (const f of files) {
      const name = f.split('/').pop();
      let key = null;
      if (name === 'index.d.ts') {
        const parent = f.split('/').slice(-2, -1)[0];
        if (parent) key = parent.toLowerCase();
      } else if (name.endsWith('.d.ts')) {
        key = name.slice(0, -5).toLowerCase();
      }
      if (!key) continue;
      if (!idx.byBaseName.has(key)) idx.byBaseName.set(key, []);
      idx.byBaseName.get(key).push(f);
    }
    // Sort candidates: classic/ (high-level wrappers with begin*AndWait)
    // first, then operationsInterfaces/, then operations/, then api/.
    function score(f) {
      if (f.includes('/classic/')) return 0;
      if (f.includes('/operationsInterfaces/')) return 1;
      if (f.includes('/operations/')) return 2;
      if (f.includes('/api/')) return 3;
      return 4;
    }
    for (const arr of idx.byBaseName.values()) arr.sort((a, b) => score(a) - score(b));
  } catch {
    /* not resolvable */
  }
  azureFileIndexCache.set(pkg, idx);
  return idx;
}

async function azureFindOperationFiles(pkg, group) {
  const idx = await azureBuildFileIndex(pkg);
  return idx.byBaseName.get(group.toLowerCase()) ?? [];
}

const azureModelCache = new Map();
async function azureLoadModels(pkg) {
  if (azureModelCache.has(pkg)) return azureModelCache.get(pkg);
  let modelsSrc = '';
  const idx = await azureBuildFileIndex(pkg);
  // Find the largest `models/index.d.ts` (best signal — it's the
  // central model file).
  let best = null;
  let bestSize = 0;
  for (const f of idx.allFiles) {
    if (f.endsWith('/models/index.d.ts') || f.endsWith('/models.d.ts') || f.endsWith('/models/mappers.d.ts')) {
      try {
        const stat = await fs.stat(f);
        if (stat.size > bestSize) {
          best = f;
          bestSize = stat.size;
        }
      } catch {
        /* skip */
      }
    }
  }
  if (best) {
    try {
      modelsSrc = await fs.readFile(best, 'utf8');
    } catch {
      modelsSrc = '';
    }
  }
  azureModelCache.set(pkg, modelsSrc);
  return modelsSrc;
}

function azureCollectInterfaceFields(modelsSrc, name) {
  const re = new RegExp(
    `export\\s+interface\\s+${name}\\s*(?:extends\\s+([^{]+))?\\{([\\s\\S]*?)\\n\\}`,
    'm',
  );
  const m = modelsSrc.match(re);
  if (!m) return null;
  const parents = m[1]
    ? m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const body = m[2];
  const fields = new Set();
  for (const fm of body.matchAll(/^\s*([A-Za-z_][\w]*)\??\s*:/gm)) fields.add(fm[1]);
  for (const parent of parents) {
    const inherited = azureCollectInterfaceFields(modelsSrc, parent);
    if (inherited) for (const f of inherited.fields) fields.add(f);
  }
  return { fields, parents };
}

/**
 * Cross-file variant: searches every .d.ts in the package for the
 * interface and recursively resolves parent interfaces (extends X, Y)
 * even when they live in different files. Caches per pkg+name.
 */
const azureCrossFileCache = new Map();
async function azureCollectFieldsCrossFile(pkg, name, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);
  const cacheKey = `${pkg}::${name}`;
  if (azureCrossFileCache.has(cacheKey)) return azureCrossFileCache.get(cacheKey);

  const idx = await azureBuildFileIndex(pkg);
  const allFields = new Set();
  let found = false;
  for (const file of idx.allFiles) {
    if (!file.includes('/models/')) continue;
    const src = await fs.readFile(file, 'utf8');
    const result = azureCollectInterfaceFields(src, name);
    if (!result) continue;
    found = true;
    for (const f of result.fields) allFields.add(f);
    for (const parent of result.parents) {
      const parentFields = await azureCollectFieldsCrossFile(pkg, parent, seen);
      for (const f of parentFields) allFields.add(f);
    }
    break;
  }
  if (!found) {
    azureCrossFileCache.set(cacheKey, null);
    return null;
  }
  azureCrossFileCache.set(cacheKey, allFields);
  return allFields;
}

async function azureGetBodyTypeFields(pkg, group, method) {
  const opFiles = await azureFindOperationFiles(pkg, group);
  if (opFiles.length === 0) return { found: false, reason: `operations file for "${group}" not found in ${pkg}` };
  // Match: `<method>(...): Promise<...>` (old SDKs) OR
  //        `<method>: (...) => Promise<...>` (new modular classic/).
  const reSig1 = new RegExp(`\\b${method}\\(([^)]*)\\)\\s*:\\s*Promise<`);
  const reSig2 = new RegExp(`\\b${method}\\s*:\\s*\\(([^)]*)\\)\\s*=>\\s*Promise<`);
  let m = null;
  let chosenFile = null;
  for (const opFile of opFiles) {
    const src = await fs.readFile(opFile, 'utf8');
    m = src.match(reSig1) ?? src.match(reSig2);
    if (m) {
      chosenFile = opFile;
      break;
    }
  }
  if (!m) return { found: false, reason: `method "${method}" not found in any operations file for "${group}"` };
  const params = m[1].split(',').map((p) => p.trim());
  let bodyType = null;
  for (const p of params) {
    if (p.includes('OptionalParams')) continue;
    // Skip namespace-qualified types like `msRest.RestResponse` — we
    // only want the body parameter interface, which is a direct
    // identifier.
    const tm = p.match(/^[a-zA-Z_]\w*\??\s*:\s*([A-Za-z_]\w*)(?:\s*[<,)]|$)/);
    if (tm && !tm[1].match(/^(msRest|coreClient|coreRestPipeline)$/)) bodyType = tm[1];
  }
  if (!bodyType || ['string', 'number', 'boolean', 'object', 'unknown', 'any'].includes(bodyType))
    return { found: false, reason: `body type for "${group}.${method}" is primitive, no fields to verify` };
  // Cross-file recursive resolution (follows extends chains across
  // every .d.ts in models/).
  const fields = await azureCollectFieldsCrossFile(pkg, bodyType);
  if (fields) return { found: true, fields: [...fields], interface: bodyType };
  return { found: false, reason: `interface "${bodyType}" not found in models (chosenFile=${chosenFile})` };
}

async function azureFindInterfaceAnywhere(pkg, name) {
  const idx = await azureBuildFileIndex(pkg);
  for (const file of idx.allFiles) {
    // Skip operations files; model interfaces live in models/.
    if (!file.includes('/models/') && !file.endsWith('/index.d.ts')) continue;
    const src = await fs.readFile(file, 'utf8');
    const fields = azureCollectInterfaceFields(src, name);
    if (fields) return fields;
  }
  return null;
}

// ─── GCP resolver ──────────────────────────────────────────────────────────

const gcpProtosCache = new Map();
async function gcpLoadProtos(pkg) {
  if (gcpProtosCache.has(pkg)) return gcpProtosCache.get(pkg);
  let src = '';
  try {
    const entry = require_core.resolve(`${pkg}/package.json`);
    const base = dirname(entry);
    // Common locations: build/protos/protos.d.ts (most), src/...
    for (const candidate of ['build/protos/protos.d.ts', 'protos/protos.d.ts']) {
      try {
        src = await fs.readFile(join(base, candidate), 'utf8');
        break;
      } catch {
        // try next
      }
    }
  } catch {
    // not resolvable
  }
  gcpProtosCache.set(pkg, src);
  return src;
}

const gcpRequestCache = new Map();
async function gcpGetRequestFields(pkg, method) {
  const cacheKey = `${pkg}::${method}`;
  if (gcpRequestCache.has(cacheKey)) return gcpRequestCache.get(cacheKey);
  const src = await gcpLoadProtos(pkg);
  if (!src) {
    gcpRequestCache.set(cacheKey, { found: false, reason: 'protos.d.ts not found' });
    return gcpRequestCache.get(cacheKey);
  }
  // camelCase method → PascalCase request name. e.g.,
  //   createSecret → ICreateSecretRequest
  //   getSecret    → IGetSecretRequest
  //   updateSecret → IUpdateSecretRequest
  const pascal = method.charAt(0).toUpperCase() + method.slice(1);
  const candidates = [`I${pascal}Request`, `${pascal}Request`];
  for (const candidate of candidates) {
    // GCP protos.d.ts often has MULTIPLE versions of the same
    // interface (one per API version: v1, v2, v2beta3, …). Aggregate
    // fields across every match so handlers using a different API
    // version aren't false-flagged.
    const re = new RegExp(`interface\\s+${candidate}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'g');
    const fields = new Set();
    let m;
    while ((m = re.exec(src))) {
      const body = m[1];
      // Match both bare identifiers (`parent?: …`) AND quoted keys
      // (`"function"?: …`) — protobuf-generated types quote reserved
      // words. Also accept quoted identifiers in general.
      for (const fm of body.matchAll(/^\s*(?:"([A-Za-z_][\w]*)"|([A-Za-z_][\w]*))\??\s*:/gm)) {
        fields.add(fm[1] ?? fm[2]);
      }
    }
    if (fields.size > 0) {
      gcpRequestCache.set(cacheKey, { found: true, fields: [...fields], interface: candidate });
      return gcpRequestCache.get(cacheKey);
    }
  }
  gcpRequestCache.set(cacheKey, { found: false, reason: `no I${pascal}Request interface in protos.d.ts` });
  return gcpRequestCache.get(cacheKey);
}

// ─── Kubernetes resolver ───────────────────────────────────────────────────
//
// K8s handler shape (very uniform across all handlers):
//
//   const body = { apiVersion: 'apps/v1', kind: 'Deployment',
//                  metadata: {…}, spec: {…} };
//   await apps.createNamespacedDeployment({ namespace, body });
//
// The top-level fields of every K8s resource are governed by its
// V<n><Kind> model class in `@kubernetes/client-node/dist/gen/models/`.
// We look up the model class by the literal Kind value declared in
// the body, and verify the body's top-level keys against the class's
// declared instance properties (`'apiVersion'?: string` etc).
//
// Skipped: `createNamespacedCustomObject` calls (CRDs are user-defined
// types with no model class in client-node).

const K8S_PKG = '@kubernetes/client-node';

const k8sModelDirCache = { dir: null };
async function k8sLocateModelsDir() {
  if (k8sModelDirCache.dir !== null) return k8sModelDirCache.dir;
  let dir = null;
  try {
    const entry = require_core.resolve(`${K8S_PKG}/package.json`);
    dir = join(dirname(entry), 'dist/gen/models');
  } catch {
    dir = '';
  }
  k8sModelDirCache.dir = dir;
  return dir;
}

const k8sModelFieldsCache = new Map();
async function k8sGetModelFields(kind) {
  if (k8sModelFieldsCache.has(kind)) return k8sModelFieldsCache.get(kind);
  const dir = await k8sLocateModelsDir();
  if (!dir) {
    k8sModelFieldsCache.set(kind, { found: false, reason: '@kubernetes/client-node not installed' });
    return k8sModelFieldsCache.get(kind);
  }
  // Try V1<Kind> first, fall back to V2<Kind> (HPA) and V1beta1<Kind>.
  for (const prefix of ['V1', 'V2', 'V1beta1', 'V2beta2', 'V1alpha1']) {
    const file = join(dir, `${prefix}${kind}.d.ts`);
    let src;
    try {
      src = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    const fields = new Set();
    // Match: `'apiVersion'?: string;` — quoted-property declarations.
    for (const m of src.matchAll(/^\s*'([A-Za-z_][\w]*)'\??\s*:/gm)) fields.add(m[1]);
    if (fields.size > 0) {
      const result = { found: true, fields: [...fields], interface: `${prefix}${kind}` };
      k8sModelFieldsCache.set(kind, result);
      return result;
    }
  }
  k8sModelFieldsCache.set(kind, { found: false, reason: `no V*${kind}.d.ts model class` });
  return k8sModelFieldsCache.get(kind);
}

/**
 * Find every `Namespaced<Kind>` operation invocation (excluding CRDs)
 * and pair it with the body literal in scope. Returns one entry per
 * unique body literal so we don't double-count create + replace using
 * the same body.
 */
function scanKubernetesInvocations(src) {
  const out = [];
  const seenBodies = new Set();

  // 1) Object literals whose top-level keys include `apiVersion` AND
  //    `kind` — these are the K8s resource bodies. We extract their
  //    kind value and verify their top-level keys.
  const litRe = /(\{[\s\S]*?)(?=\n\s{6}\})/g; // unused; just for clarity

  // Walk every `kind: '<Kind>'` (or "<Kind>") string in the file. For
  // each, find the enclosing object literal's open-brace by scanning
  // backwards to a balanced `{`, then capture top-level keys. Match
  // only on lines that look like a top-level body property (avoid
  // nested `kind: 'Deployment'` inside scaleTargetRef etc by checking
  // that `apiVersion` appears within ~10 lines).
  const kindRe = /\bkind\s*:\s*['"]([A-Z][A-Za-z0-9]+)['"]/g;
  let km;
  while ((km = kindRe.exec(src))) {
    const kind = km[1];
    // Skip pseudo-kinds nested deep in specs (we only want the body
    // literal that ALSO has apiVersion at the same depth).
    const kindIdx = km.index;
    // Look for opening `{` of the enclosing object literal. Walk back
    // counting braces.
    let depth = 0;
    let openIdx = -1;
    for (let i = kindIdx; i >= 0; i--) {
      const c = src[i];
      if (c === '}') depth++;
      else if (c === '{') {
        if (depth === 0) {
          openIdx = i;
          break;
        }
        depth--;
      }
    }
    if (openIdx < 0) continue;
    // Confirm `apiVersion:` is at the same nesting level by looking
    // for it within the same enclosing literal.
    const keys = topLevelKeys(src, openIdx);
    if (!keys.includes('apiVersion') || !keys.includes('kind')) continue;
    // Top-level K8s resource bodies always carry metadata. Inner refs
    // (CrossVersionObjectReference, OwnerReference, …) have apiVersion
    // + kind but no metadata — filter them out here.
    if (!keys.includes('metadata')) continue;
    // Dedupe by literal opening position.
    if (seenBodies.has(openIdx)) continue;
    seenBodies.add(openIdx);
    out.push({ provider: 'kubernetes', kind, keys, openIdx });
  }

  return out;
}

// ─── Alibaba resolver ──────────────────────────────────────────────────────
//
// Alibaba handler shape (uniform across all Alibaba handlers):
//
//   const ecs = await resolveClient(ctx, 'ecs');
//   await ecs.createInstance({ regionId, instanceName, imageId, … });
//
// Each operation maps to a `<Op>Request` class in
// `@alicloud/<svc>/dist/models/<Op>Request.d.ts`. We extract the class
// body's top-level fields and verify the object literal keys.
//
// Service short-name → npm package mapping comes from
// `packages/core/src/deploy/providers/alibaba/sdk-loader.ts SERVICE_PACKAGES`.

let alibabaServiceMapCache = null;
async function loadAlibabaServiceMap() {
  if (alibabaServiceMapCache) return alibabaServiceMapCache;
  const map = new Map();
  try {
    const src = await fs.readFile(
      join(ROOT, 'packages/core/src/deploy/providers/alibaba/sdk-loader.ts'),
      'utf8',
    );
    // Match: `  ecs: { pkg: '@alicloud/ecs20140526', endpoint_prefix: 'ecs' },`
    const re = /^\s*([a-z]+):\s*\{\s*pkg:\s*['"](@alicloud\/[^'"]+)['"]/gm;
    let m;
    while ((m = re.exec(src))) map.set(m[1], m[2]);
  } catch {
    /* loader not readable */
  }
  alibabaServiceMapCache = map;
  return map;
}

const alibabaModelFieldsCache = new Map();
async function alibabaGetRequestFields(pkg, method) {
  const cacheKey = `${pkg}::${method}`;
  if (alibabaModelFieldsCache.has(cacheKey)) return alibabaModelFieldsCache.get(cacheKey);
  // method `createInstance` → request `CreateInstanceRequest`
  const requestClass = `${method.charAt(0).toUpperCase()}${method.slice(1)}Request`;
  let dir;
  try {
    const entry = require_core.resolve(`${pkg}/package.json`);
    dir = join(dirname(entry), 'dist/models');
  } catch {
    const result = { found: false, reason: `${pkg} not installed` };
    alibabaModelFieldsCache.set(cacheKey, result);
    return result;
  }
  const file = join(dir, `${requestClass}.d.ts`);
  let src;
  try {
    src = await fs.readFile(file, 'utf8');
  } catch {
    const result = { found: false, reason: `${requestClass}.d.ts not found in ${pkg}` };
    alibabaModelFieldsCache.set(cacheKey, result);
    return result;
  }
  // The request class declaration is `export declare class <Name>Request extends $dara.Model { … }`.
  // Top-level fields are 2-space-indented declarations directly inside
  // the class body. Nested classes are also declared in the same file
  // (e.g. `CreateInstanceRequestSystemDisk`) but their fields don't
  // belong to the top-level request.
  const classMatch = src.match(
    new RegExp(`export\\s+declare\\s+class\\s+${requestClass}\\s+extends\\s+\\$dara\\.Model\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'),
  );
  if (!classMatch) {
    const result = { found: false, reason: `class ${requestClass} not found in ${file}` };
    alibabaModelFieldsCache.set(cacheKey, result);
    return result;
  }
  const body = classMatch[1];
  const fields = new Set();
  // Match field declarations: `    <name>?: <type>;` — only top-level
  // (4-space indent inside the class body).
  for (const m of body.matchAll(/^\s{4}([A-Za-z_][\w]*)\??\s*:/gm)) fields.add(m[1]);
  const result = { found: true, fields: [...fields], interface: requestClass };
  alibabaModelFieldsCache.set(cacheKey, result);
  return result;
}

/**
 * Scan Alibaba handler invocations.
 *
 *   const <alias> = await resolveClient(ctx, '<service>');
 *   …
 *   await <alias>.<method>({ <obj> });
 *
 * We track the alias → service mapping then attribute each
 * `<alias>.<method>(` call to its service short-name.
 */
function scanAlibabaInvocations(src) {
  // Map alias name → service short-name
  const aliasToService = new Map();
  for (const m of src.matchAll(
    /const\s+([a-z_][\w]*)\s*=\s*await\s+resolveClient\(\s*ctx\s*,\s*['"]([a-z]+)['"]\s*\)/g,
  )) {
    aliasToService.set(m[1], m[2]);
  }
  const out = [];
  for (const [alias, service] of aliasToService) {
    const re = new RegExp(`\\b${alias}\\.([a-zA-Z_][\\w]*)\\(\\s*\\{`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const method = m[1];
      const objStart = m.index + m[0].length - 1;
      out.push({
        provider: 'alibaba',
        service,
        method,
        keys: topLevelKeys(src, objStart),
      });
    }
  }
  return out;
}

// ─── OCI resolver ──────────────────────────────────────────────────────────
//
// OCI SDK shape:
//
//   await compute.launchInstance({ launchInstanceDetails: {…} });
//
// Each method maps to a `<Op>Request` interface declared in
// `oci-<svc>/lib/request/<op>-request.d.ts` (kebab-case file, Pascal
// interface). Top-level body fields are quoted-property declarations:
//
//   "launchInstanceDetails": model.LaunchInstanceDetails;
//
// Service short-name → npm package mapping comes from
// `packages/core/src/deploy/providers/oci/sdk-loader.ts SERVICE_PACKAGES`.

let ociServiceMapCache = null;
async function loadOciServiceMap() {
  if (ociServiceMapCache) return ociServiceMapCache;
  const map = new Map();
  try {
    const src = await fs.readFile(
      join(ROOT, 'packages/core/src/deploy/providers/oci/sdk-loader.ts'),
      'utf8',
    );
    // Match: `  core: { pkg: 'oci-core', clientName: 'ComputeClient' },`
    const re = /^\s*([a-z]+):\s*\{\s*pkg:\s*['"](oci-[^'"]+)['"]/gm;
    let m;
    while ((m = re.exec(src))) map.set(m[1], m[2]);
  } catch {
    /* loader not readable */
  }
  ociServiceMapCache = map;
  return map;
}

function camelToKebab(camel) {
  return camel.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

const ociRequestFieldsCache = new Map();
async function ociGetRequestFields(pkg, method) {
  const cacheKey = `${pkg}::${method}`;
  if (ociRequestFieldsCache.has(cacheKey)) return ociRequestFieldsCache.get(cacheKey);
  // method `launchInstance` → request file `launch-instance-request.d.ts`,
  // interface `LaunchInstanceRequest`.
  const fileBase = `${camelToKebab(method)}-request.d.ts`;
  const interfaceName = `${method.charAt(0).toUpperCase()}${method.slice(1)}Request`;
  let dir;
  try {
    const entry = require_core.resolve(`${pkg}/package.json`);
    dir = join(dirname(entry), 'lib/request');
  } catch {
    const result = { found: false, reason: `${pkg} not installed` };
    ociRequestFieldsCache.set(cacheKey, result);
    return result;
  }
  const file = join(dir, fileBase);
  let src;
  try {
    src = await fs.readFile(file, 'utf8');
  } catch {
    const result = { found: false, reason: `${fileBase} not found in ${pkg}` };
    ociRequestFieldsCache.set(cacheKey, result);
    return result;
  }
  // OCI request interfaces look like:
  //   export interface LaunchInstanceRequest extends common.BaseRequest {
  //     "launchInstanceDetails": model.LaunchInstanceDetails;
  //     "opcRetryToken"?: string;
  //     …
  //   }
  const m = src.match(
    new RegExp(
      `export\\s+interface\\s+${interfaceName}\\s+extends\\s+[^{]+\\{([\\s\\S]*?)\\n\\}`,
      'm',
    ),
  );
  if (!m) {
    const result = { found: false, reason: `interface ${interfaceName} not found in ${file}` };
    ociRequestFieldsCache.set(cacheKey, result);
    return result;
  }
  const body = m[1];
  const fields = new Set();
  // Match quoted properties: `    "launchInstanceDetails": …`
  for (const fm of body.matchAll(/^\s*"([A-Za-z_][\w]*)"\??\s*:/gm)) fields.add(fm[1]);
  const result = { found: true, fields: [...fields], interface: interfaceName };
  ociRequestFieldsCache.set(cacheKey, result);
  return result;
}

function scanOciInvocations(src) {
  const aliasToService = new Map();
  for (const m of src.matchAll(
    /const\s+([a-z_][\w]*)\s*=\s*await\s+resolveClient\(\s*ctx\s*,\s*['"]([a-z]+)['"]\s*\)/g,
  )) {
    aliasToService.set(m[1], m[2]);
  }
  const out = [];
  for (const [alias, service] of aliasToService) {
    const re = new RegExp(`\\b${alias}\\.([a-zA-Z_][\\w]*)\\(\\s*\\{`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const method = m[1];
      const objStart = m.index + m[0].length - 1;
      out.push({
        provider: 'oci',
        service,
        method,
        keys: topLevelKeys(src, objStart),
      });
    }
  }
  return out;
}

// ─── DigitalOcean resolver ─────────────────────────────────────────────────
//
// dots-wrapper shape (per published 3.x):
//
//   await client.droplet.createDroplet({ name, image, size, region, … });
//
// Each method maps to a file under
// `dots-wrapper/dist/<namespace-kebab>/<method-kebab>/<method-kebab>.d.ts`
// declaring `I<Method>ApiRequest` interface.

function dotsCamelToKebab(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

const dotsRequestFieldsCache = new Map();
async function dotsGetRequestFields(namespace, method) {
  const cacheKey = `${namespace}::${method}`;
  if (dotsRequestFieldsCache.has(cacheKey)) return dotsRequestFieldsCache.get(cacheKey);
  const namespaceKebab = dotsCamelToKebab(namespace);
  const methodKebab = dotsCamelToKebab(method);
  const interfaceName = `I${method.charAt(0).toUpperCase()}${method.slice(1)}ApiRequest`;
  let dir;
  try {
    const entry = require_core.resolve('dots-wrapper/package.json');
    dir = join(dirname(entry), 'dist', namespaceKebab, methodKebab);
  } catch {
    const result = { found: false, reason: 'dots-wrapper not installed' };
    dotsRequestFieldsCache.set(cacheKey, result);
    return result;
  }
  const file = join(dir, `${methodKebab}.d.ts`);
  let src;
  try {
    src = await fs.readFile(file, 'utf8');
  } catch {
    const result = {
      found: false,
      reason: `${namespaceKebab}/${methodKebab}/${methodKebab}.d.ts not found in dots-wrapper`,
    };
    dotsRequestFieldsCache.set(cacheKey, result);
    return result;
  }
  const fields = new Set();
  // Path 1: explicit `I<Method>ApiRequest` interface defined in the
  // same file. Most dots-wrapper modules declare one.
  const m = src.match(new RegExp(`export\\s+interface\\s+${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  if (m) {
    for (const fm of m[1].matchAll(/^\s*([a-z_][\w]*)\??\s*:/gm)) fields.add(fm[1]);
  } else {
    // Path 2: fall back to the destructured params on the last arrow
    // signature: `export declare const <method>: (...) => ({ a, b, c, }:
    // <ExternalType>) => Promise<…>`. The keys we want are the inner
    // destructuring on the second arrow. Useful for handlers that
    // accept an externally-declared interface like `IFirewall`.
    const arrowRe = new RegExp(
      `export\\s+declare\\s+const\\s+${method}\\s*:\\s*[^=]*=>\\s*\\(\\s*\\{([^}]*)\\}`,
      'm',
    );
    const arrow = src.match(arrowRe);
    if (arrow) {
      for (const id of arrow[1].split(',')) {
        const name = id.trim().replace(/[?:].*$/, '').trim();
        if (/^[a-z_][\w]*$/i.test(name)) fields.add(name);
      }
    }
  }
  if (fields.size === 0) {
    const result = { found: false, reason: `no I${method[0].toUpperCase()}${method.slice(1)}ApiRequest or destructured params in ${methodKebab}.d.ts` };
    dotsRequestFieldsCache.set(cacheKey, result);
    return result;
  }
  const result = { found: true, fields: [...fields], interface: interfaceName };
  dotsRequestFieldsCache.set(cacheKey, result);
  return result;
}

function scanDigitalOceanInvocations(src) {
  // Patterns:
  //   ctx.client.<namespace>.<method>({ … })
  //   await ctx.client.<namespace>.<method>({ … })
  const out = [];
  const re = /\bctx\.client\.([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)\(\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const namespace = m[1];
    const method = m[2];
    const objStart = m.index + m[0].length - 1;
    out.push({
      provider: 'digitalocean',
      namespace,
      method,
      keys: topLevelKeys(src, objStart),
    });
  }
  return out;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function isAwsPkg(p) {
  return p?.startsWith('@aws-sdk/');
}
function isAzurePkg(p) {
  return p?.startsWith('@azure/arm-') || p === '@azure/identity';
}
function isGcpPkg(p) {
  return p?.startsWith('@google-cloud/');
}

function providerOfFile(file) {
  if (file.includes('/aws/handlers/')) return 'aws';
  if (file.includes('/azure/handlers/')) return 'azure';
  if (file.includes('/gcp/handlers/')) return 'gcp';
  if (file.includes('/kubernetes/handlers/')) return 'kubernetes';
  if (file.includes('/alibaba/handlers/')) return 'alibaba';
  if (file.includes('/oci/handlers/')) return 'oci';
  if (file.includes('/digitalocean/handlers/')) return 'digitalocean';
  if (file.includes('/ibm/handlers/')) return 'ibm';
  return null;
}

/**
 * Heuristically pick the SDK package an Azure / GCP handler is calling
 * into. For Azure we use the `const SDK = ...` declaration when
 * present; failing that, the first `@azure/arm-*` package in the
 * file. For GCP we use the first `@google-cloud/*` package referenced
 * via `load_*_sdk` or in any other way the file imports it.
 */
function pickAzureSdk(src, aliasMap) {
  const declared = src.match(/const\s+SDK\s*=\s*['"](@azure\/[^'"]+)['"]/)?.[1];
  if (declared) return declared;
  for (const p of aliasMap.values()) if (isAzurePkg(p)) return p;
  // Fall back to scanning the file for an Azure pkg reference.
  return src.match(/['"](@azure\/arm-[^'"]+)['"]/)?.[1] ?? null;
}
let gcpClientKeyMapCache = null;
async function loadGcpClientKeyMap() {
  if (gcpClientKeyMapCache) return gcpClientKeyMapCache;
  const map = new Map();
  try {
    const src = await fs.readFile(join(ROOT, 'packages/core/src/deploy/providers/gcp/sdk-loader.ts'), 'utf8');
    // Walk linearly. Track the "active pkg" — the most recent
    // `load_sdk('<pkg>')` call. Every `clients.set('<key>', ...)`
    // after that gets attributed to the active pkg until the next
    // load_sdk. This handles both patterns:
    //   const compute = await load_sdk('@google-cloud/compute');
    //   clients.set('compute.instances', new compute.InstancesClient(…));
    //   // — direct alias
    //   const cb = await load_sdk('@google-cloud/cloudbuild');
    //   const Client = cb.v1?.CloudBuildClient ?? cb.CloudBuildClient;
    //   if (Client) clients.set('cloudbuild', new Client(…));
    //   // — indirect via intermediate variable
    const lines = src.split('\n');
    let activePkg = null;
    for (const line of lines) {
      const loadMatch = line.match(/load_sdk\(\s*['"]([^'"]+)['"]\s*\)/);
      if (loadMatch) activePkg = loadMatch[1];
      const setMatch = line.match(/clients\.set\(\s*['"]([^'"]+)['"]\s*,/);
      if (setMatch && activePkg && !map.has(setMatch[1])) map.set(setMatch[1], activePkg);
    }
  } catch {
    /* no loader */
  }
  gcpClientKeyMapCache = map;
  return map;
}

async function pickGcpSdk(src) {
  // Try literal first.
  const literal = src.match(/['"](@google-cloud\/[^'"]+)['"]/)?.[1];
  if (literal) return literal;
  // Otherwise walk `ctx.clients.get('<key>')` and map via the loader.
  const keyMap = await loadGcpClientKeyMap();
  for (const m of src.matchAll(/ctx\.clients\.get\(['"]([^'"]+)['"]\)/g)) {
    const pkg = keyMap.get(m[1]);
    if (pkg) return pkg;
  }
  return null;
}

async function main() {
  const handlerFiles = [];
  for (const rel of HANDLER_DIRS) {
    const files = await walkHandlersDir(join(ROOT, rel));
    handlerFiles.push(...files);
  }

  const summary = {
    handlersScanned: 0,
    invocations: { aws: 0, azure: 0, gcp: 0, kubernetes: 0, alibaba: 0, oci: 0, digitalocean: 0, ibm: 0 },
    verified: { aws: 0, azure: 0, gcp: 0, kubernetes: 0, alibaba: 0, oci: 0, digitalocean: 0, ibm: 0 },
    unverified: { aws: 0, azure: 0, gcp: 0, kubernetes: 0, alibaba: 0, oci: 0, digitalocean: 0, ibm: 0 },
    mismatches: [],
  };

  for (const file of handlerFiles) {
    const src = await fs.readFile(file, 'utf8');
    const aliasMap = extractAliasMap(src);
    const provider = providerOfFile(file);
    let any = false;

    if (provider === 'aws') {
      for (const inv of scanAwsInvocations(src)) {
        summary.invocations.aws++;
        any = true;
        const pkg = aliasMap.get(inv.alias);
        if (!pkg || !isAwsPkg(pkg)) {
          summary.unverified.aws++;
          if (VERBOSE) console.log(`  ${file.replace(ROOT + '/', '')}: ${inv.cmd} → alias unresolved`);
          continue;
        }
        const result = await awsGetInputFields(pkg, inv.cmdShort);
        if (!result.found) {
          summary.unverified.aws++;
          if (VERBOSE)
            console.log(`  ${file.replace(ROOT + '/', '')}: ${inv.cmd} in ${pkg} → interface not found`);
          continue;
        }
        const validSet = new Set(result.fields);
        const unknown = inv.keys.filter((k) => !validSet.has(k));
        summary.verified.aws++;
        if (unknown.length) {
          summary.mismatches.push({
            provider: 'aws',
            file: file.replace(ROOT + '/', ''),
            command: inv.cmd,
            package: pkg,
            inputInterface: result.interface,
            unknown,
            passed: inv.keys,
            valid: result.fields,
          });
        }
      }
    } else if (provider === 'azure') {
      const sdkPkg = pickAzureSdk(src, aliasMap);
      if (!sdkPkg) continue;
      for (const inv of scanAzureInvocations(src, sdkPkg)) {
        summary.invocations.azure++;
        any = true;
        const result = await azureGetBodyTypeFields(sdkPkg, inv.group, inv.method);
        if (!result.found) {
          summary.unverified.azure++;
          if (VERBOSE)
            console.log(
              `  ${file.replace(ROOT + '/', '')}: client.${inv.group}.${inv.method} → ${result.reason}`,
            );
          continue;
        }
        const validSet = new Set(result.fields);
        const unknown = inv.keys.filter((k) => !validSet.has(k));
        summary.verified.azure++;
        if (unknown.length) {
          summary.mismatches.push({
            provider: 'azure',
            file: file.replace(ROOT + '/', ''),
            command: `${inv.group}.${inv.method}`,
            package: sdkPkg,
            inputInterface: result.interface,
            unknown,
            passed: inv.keys,
            valid: result.fields,
          });
        }
      }
    } else if (provider === 'kubernetes') {
      for (const inv of scanKubernetesInvocations(src)) {
        summary.invocations.kubernetes++;
        any = true;
        const result = await k8sGetModelFields(inv.kind);
        if (!result.found) {
          summary.unverified.kubernetes++;
          if (VERBOSE)
            console.log(`  ${file.replace(ROOT + '/', '')}: kind ${inv.kind} → ${result.reason}`);
          continue;
        }
        const validSet = new Set(result.fields);
        const unknown = inv.keys.filter((k) => !validSet.has(k));
        summary.verified.kubernetes++;
        if (unknown.length) {
          summary.mismatches.push({
            provider: 'kubernetes',
            file: file.replace(ROOT + '/', ''),
            command: inv.kind,
            package: K8S_PKG,
            inputInterface: result.interface,
            unknown,
            passed: inv.keys,
            valid: result.fields,
          });
        }
      }
    } else if (provider === 'digitalocean') {
      for (const inv of scanDigitalOceanInvocations(src)) {
        summary.invocations.digitalocean++;
        any = true;
        const result = await dotsGetRequestFields(inv.namespace, inv.method);
        if (!result.found) {
          summary.unverified.digitalocean++;
          if (VERBOSE)
            console.log(
              `  ${file.replace(ROOT + '/', '')}: ${inv.namespace}.${inv.method} → ${result.reason}`,
            );
          continue;
        }
        const validSet = new Set(result.fields);
        const unknown = inv.keys.filter((k) => !validSet.has(k));
        summary.verified.digitalocean++;
        if (unknown.length) {
          summary.mismatches.push({
            provider: 'digitalocean',
            file: file.replace(ROOT + '/', ''),
            command: `${inv.namespace}.${inv.method}`,
            package: 'dots-wrapper',
            inputInterface: result.interface,
            unknown,
            passed: inv.keys,
            valid: result.fields,
          });
        }
      }
    } else if (provider === 'oci') {
      const serviceMap = await loadOciServiceMap();
      for (const inv of scanOciInvocations(src)) {
        summary.invocations.oci++;
        any = true;
        const pkg = serviceMap.get(inv.service);
        if (!pkg) {
          summary.unverified.oci++;
          if (VERBOSE)
            console.log(`  ${file.replace(ROOT + '/', '')}: ${inv.service}.${inv.method} → no oci-* mapping`);
          continue;
        }
        const result = await ociGetRequestFields(pkg, inv.method);
        if (!result.found) {
          summary.unverified.oci++;
          if (VERBOSE)
            console.log(`  ${file.replace(ROOT + '/', '')}: ${inv.service}.${inv.method} → ${result.reason}`);
          continue;
        }
        const validSet = new Set(result.fields);
        const unknown = inv.keys.filter((k) => !validSet.has(k));
        summary.verified.oci++;
        if (unknown.length) {
          summary.mismatches.push({
            provider: 'oci',
            file: file.replace(ROOT + '/', ''),
            command: `${inv.service}.${inv.method}`,
            package: pkg,
            inputInterface: result.interface,
            unknown,
            passed: inv.keys,
            valid: result.fields,
          });
        }
      }
    } else if (provider === 'alibaba') {
      const serviceMap = await loadAlibabaServiceMap();
      for (const inv of scanAlibabaInvocations(src)) {
        summary.invocations.alibaba++;
        any = true;
        const pkg = serviceMap.get(inv.service);
        if (!pkg) {
          summary.unverified.alibaba++;
          if (VERBOSE)
            console.log(
              `  ${file.replace(ROOT + '/', '')}: ${inv.service}.${inv.method} → no @alicloud/* mapping`,
            );
          continue;
        }
        const result = await alibabaGetRequestFields(pkg, inv.method);
        if (!result.found) {
          summary.unverified.alibaba++;
          if (VERBOSE)
            console.log(
              `  ${file.replace(ROOT + '/', '')}: ${inv.service}.${inv.method} → ${result.reason}`,
            );
          continue;
        }
        const validSet = new Set(result.fields);
        const unknown = inv.keys.filter((k) => !validSet.has(k));
        summary.verified.alibaba++;
        if (unknown.length) {
          summary.mismatches.push({
            provider: 'alibaba',
            file: file.replace(ROOT + '/', ''),
            command: `${inv.service}.${inv.method}`,
            package: pkg,
            inputInterface: result.interface,
            unknown,
            passed: inv.keys,
            valid: result.fields,
          });
        }
      }
    } else if (provider === 'gcp') {
      const sdkPkg = await pickGcpSdk(src);
      if (!sdkPkg) continue;
      for (const inv of scanGcpInvocations(src, sdkPkg)) {
        summary.invocations.gcp++;
        any = true;
        const result = await gcpGetRequestFields(sdkPkg, inv.method);
        if (!result.found) {
          summary.unverified.gcp++;
          if (VERBOSE)
            console.log(`  ${file.replace(ROOT + '/', '')}: client.${inv.method} → ${result.reason}`);
          continue;
        }
        const validSet = new Set(result.fields);
        const unknown = inv.keys.filter((k) => !validSet.has(k));
        summary.verified.gcp++;
        if (unknown.length) {
          summary.mismatches.push({
            provider: 'gcp',
            file: file.replace(ROOT + '/', ''),
            command: inv.method,
            package: sdkPkg,
            inputInterface: result.interface,
            unknown,
            passed: inv.keys,
            valid: result.fields,
          });
        }
      }
    }
    if (any) summary.handlersScanned++;
  }

  console.log('=== SDK command-input verification (all providers) ===');
  console.log(`Handlers scanned:    ${summary.handlersScanned}`);
  for (const p of ['aws', 'azure', 'gcp', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm']) {
    console.log(
      `  ${p.padEnd(12)} invocations=${summary.invocations[p]
        .toString()
        .padStart(3)}  verified=${summary.verified[p].toString().padStart(3)}  unverified=${summary.unverified[p]
        .toString()
        .padStart(3)}`,
    );
  }
  console.log('');

  if (summary.mismatches.length === 0) {
    console.log('✓ Every handler-passed field exists in the SDK\'s declared input interface.');
    const outPath = join(ROOT, 'e2e/sdk-command-report.json');
    await fs.writeFile(outPath, JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  console.log(`✗ ${summary.mismatches.length} mismatch(es):`);
  for (const m of summary.mismatches) {
    console.log(`\n  [${m.provider}] ${m.file}`);
    console.log(`    ${m.command} (${m.package} → ${m.inputInterface})`);
    console.log(`    Handler passes: ${m.passed.join(', ')}`);
    console.log(`    Unknown:        ${m.unknown.join(', ')}`);
    if (VERBOSE)
      console.log(
        `    SDK accepts:    ${m.valid.slice(0, 12).join(', ')}${m.valid.length > 12 ? ' …' : ''}`,
      );
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
