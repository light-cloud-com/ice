/**
 * Copies the generated Prisma client from the pnpm virtual store
 * into resources/prisma-client so electron-builder can package it via extraResources.
 */
import { cpSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');

// Find .prisma/client in the pnpm virtual store
const pnpmDir = join(root, 'node_modules/.pnpm');
let prismaClientSrc = null;

for (const entry of readdirSync(pnpmDir)) {
  if (entry.startsWith('@prisma+client@')) {
    const candidate = join(pnpmDir, entry, 'node_modules/.prisma/client');
    if (existsSync(join(candidate, 'default.js'))) {
      prismaClientSrc = candidate;
      break;
    }
  }
}

if (!prismaClientSrc) {
  console.error('[copy-prisma] Could not find generated .prisma/client');
  process.exit(1);
}

// Copy to resources/prisma-client (electron-builder extraResources picks this up)
const dest = join(__dirname, '../resources/prisma-client');
mkdirSync(dest, { recursive: true });
cpSync(prismaClientSrc, dest, { recursive: true });

console.log(`[copy-prisma] Copied .prisma/client → ${dest}`);
