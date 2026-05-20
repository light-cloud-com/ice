import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/index.js',
  sourcemap: true,
  external: [
    '.prisma',
    '.prisma/*',
    'prisma',
    'better-sqlite3',
    '@google-cloud/*',
    'google-auth-library',
    'msgpackr',
    '@msgpackr-extract/*',
    'ioredis',
    'bullmq',
  ],
  banner: {
    js: [
      'import { createRequire as ___createRequire } from "module";',
      'import { fileURLToPath as ___fileURLToPath } from "url";',
      'import { dirname as ___dirname } from "path";',
      'const __filename = ___fileURLToPath(import.meta.url);',
      'const __dirname = ___dirname(__filename);',
      'const require = ___createRequire(import.meta.url);',
      '// Pre-load @prisma/client via real require (before esbuild shims)',
      'const __prisma_mod = require("@prisma/client");',
    ].join('\n'),
  },
  plugins: [{
    name: 'prisma-cjs-compat',
    setup(build) {
      // Replace @prisma/client import with reference to pre-loaded module
      build.onResolve({ filter: /^@prisma\/client$/ }, () => ({
        path: '@prisma/client',
        namespace: 'prisma-cjs',
      }));
      build.onLoad({ filter: /.*/, namespace: 'prisma-cjs' }, () => ({
        // Reference the pre-loaded module from the banner — no require() call here
        // that esbuild could intercept
        contents: `
          export const PrismaClient = __prisma_mod.PrismaClient;
          export const Prisma = __prisma_mod.Prisma;
          export default __prisma_mod;
        `,
        loader: 'js',
      }));
    },
  }],
});

console.log('Gateway bundled → dist/index.js');
