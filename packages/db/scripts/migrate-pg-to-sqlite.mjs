/**
 * One-shot migration: Postgres → SQLite.
 *
 * Two phases (pick with argv[2]):
 *   - `dump`  reads every table from the DB pointed to by DATABASE_URL and
 *             writes one JSON file per model into .migration-dump/
 *   - `load`  reads those JSON files and inserts into the DB pointed to by
 *             DATABASE_URL, with FK checks disabled for the session.
 *
 * Run with the Prisma client generated for the matching provider. The script
 * is agnostic — it just uses whichever client is currently in node_modules.
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DUMP_DIR = resolve(__dirname, '../.migration-dump');

// Parent-first order so loading succeeds even if someone forgets to disable FKs.
const MODELS = [
  'user',
  'organisation',
  'organisationMember',
  'invitation',
  'refreshToken',
  'gitHubToken',
  'canvasProject',
  'projectMember',
  'canvasCard',
  'environment',
  'providerCredential',
  'canvasDeployment',
  'deployEvent',
  'deployJob',
  'deployedResourceMapping',
  'blockRequirementStatus',
  'deploymentRule',
  'deploymentEvent',
  'webhookDelivery',
  'aiConversation',
  'aiMessage',
  'aiAuditLog',
];

function reviveDates(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
      obj[k] = new Date(v);
    }
  }
  return obj;
}

async function dump() {
  const prisma = new PrismaClient();
  mkdirSync(DUMP_DIR, { recursive: true });
  console.log(`Dumping to ${DUMP_DIR}`);
  for (const model of MODELS) {
    if (typeof prisma[model]?.findMany !== 'function') {
      console.log(`  ${model}: SKIP (missing on client)`);
      continue;
    }
    const rows = await prisma[model].findMany();
    writeFileSync(join(DUMP_DIR, `${model}.json`), JSON.stringify(rows, null, 2));
    console.log(`  ${model}: ${rows.length} rows`);
  }
  await prisma.$disconnect();
}

async function load() {
  if (!existsSync(DUMP_DIR)) {
    console.error(`No dump found at ${DUMP_DIR}. Run \`dump\` first.`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  // SQLite-specific: relax FK checks so insert order doesn't matter if a
  // parent row lands later than a child. For Postgres this is a no-op.
  try {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  } catch {
    /* ignore — not SQLite */
  }

  let totalOk = 0;
  let totalFail = 0;

  for (const model of MODELS) {
    const file = join(DUMP_DIR, `${model}.json`);
    if (!existsSync(file)) {
      console.log(`  ${model}: SKIP (no dump file)`);
      continue;
    }
    const rows = JSON.parse(readFileSync(file, 'utf-8'));
    if (rows.length === 0) {
      console.log(`  ${model}: 0`);
      continue;
    }
    if (typeof prisma[model]?.create !== 'function') {
      console.log(`  ${model}: SKIP (missing on client)`);
      continue;
    }
    let ok = 0;
    let fail = 0;
    for (const row of rows) {
      reviveDates(row);
      try {
        await prisma[model].create({ data: row });
        ok++;
      } catch (err) {
        fail++;
        console.error(`  [${model}] ${row.id ?? '?'}: ${err.message.split('\n')[0]}`);
      }
    }
    totalOk += ok;
    totalFail += fail;
    console.log(`  ${model}: ${ok} ok${fail ? `, ${fail} failed` : ''}`);
  }

  try {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  } catch {
    /* ignore */
  }
  await prisma.$disconnect();
  console.log(`\nTotal: ${totalOk} rows imported${totalFail ? `, ${totalFail} failed` : ''}`);
  if (totalFail) process.exit(1);
}

const mode = process.argv[2];
if (mode === 'dump') await dump();
else if (mode === 'load') await load();
else {
  console.error('Usage: node migrate-pg-to-sqlite.mjs <dump|load>');
  process.exit(1);
}
