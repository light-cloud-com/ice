/**
 * Repository framework detection via the GitHub Contents API.
 *
 * Extracted from `pipeline.service.ts` (rf-pipe-6). The detector
 * fetches a small set of marker files (package.json, Dockerfile,
 * requirements.txt, go.mod, ...) and returns a structured
 * FrameworkDetection result the UI uses to pre-fill build/install
 * commands when a user wires up a Source.Repository node.
 *
 * The JS-ecosystem detector (`detectJsFramework`) is module-private —
 * it's a deeply branched matcher over `pkg.dependencies` and only
 * makes sense as a sub-routine of `detectFramework`. The package-
 * manager guess uses lock-file presence (pnpm-lock.yaml > yarn.lock >
 * default to npm), but the surrounding `detectFramework` only adds
 * `package.json`, `Dockerfile`, etc. to `detectedFiles` — the lock
 * files are never added, so `pnpm-lock.yaml` / `yarn.lock` checks
 * inside `detectJsFramework` always fall through to npm. This is a
 * known caveat from the pre-extraction file: the planner flagged it
 * as out-of-scope for the refactor (verbatim preservation). Fix-up
 * is for a future unit (rf-pipe follow-up).
 */

import { GITHUB_API, GITHUB_HEADERS, type FrameworkDetection } from './types.js';
import { getGitHubToken } from './github-webhooks.js';

export async function detectFramework(
  userId: string,
  repository: string,
  branch = 'main',
): Promise<FrameworkDetection> {
  const token = await getGitHubToken(userId);
  if (!token) {
    return defaultDetection();
  }

  const [owner, repo] = repository.split('/');
  const detectedFiles: string[] = [];

  // Check for key files
  const filesToCheck = ['package.json', 'Dockerfile', 'requirements.txt', 'go.mod', 'pom.xml', 'Cargo.toml'];

  const fileContents: Record<string, string | null> = {};
  for (const file of filesToCheck) {
    const content = await fetchFileContent(token, owner, repo, file, branch);
    if (content !== null) {
      detectedFiles.push(file);
      fileContents[file] = content;
    }
  }

  // Dockerfile → container
  if (fileContents['Dockerfile'] !== null && fileContents['Dockerfile'] !== undefined) {
    return {
      framework: 'docker',
      runtime: 'container',
      buildCommand: 'docker build .',
      installCommand: null,
      outputDirectory: null,
      packageManager: null,
      confidence: 'high',
      detectedFiles,
    };
  }

  // package.json → JS/TS ecosystem
  if (fileContents['package.json']) {
    return detectJsFramework(fileContents['package.json'], detectedFiles);
  }

  // Python
  if (fileContents['requirements.txt'] !== null && fileContents['requirements.txt'] !== undefined) {
    return {
      framework: 'python',
      runtime: 'python',
      buildCommand: null,
      installCommand: 'pip install -r requirements.txt',
      outputDirectory: null,
      packageManager: 'pip',
      confidence: 'medium',
      detectedFiles,
    };
  }

  // Go
  if (fileContents['go.mod'] !== null && fileContents['go.mod'] !== undefined) {
    return {
      framework: 'go',
      runtime: 'go',
      buildCommand: 'go build -o app .',
      installCommand: null,
      outputDirectory: null,
      packageManager: null,
      confidence: 'medium',
      detectedFiles,
    };
  }

  return defaultDetection();
}

function detectJsFramework(packageJsonRaw: string, detectedFiles: string[]): FrameworkDetection {
  try {
    const pkg = JSON.parse(packageJsonRaw);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Lock file → package manager
    let packageManager = 'npm';
    let installCommand = 'npm ci';
    if (detectedFiles.includes('pnpm-lock.yaml')) {
      packageManager = 'pnpm';
      installCommand = 'pnpm install --frozen-lockfile';
    } else if (detectedFiles.includes('yarn.lock')) {
      packageManager = 'yarn';
      installCommand = 'yarn install --frozen-lockfile';
    }

    // Next.js
    if (deps['next']) {
      return {
        framework: 'nextjs',
        runtime: 'node',
        buildCommand: 'npm run build',
        installCommand,
        outputDirectory: '.next',
        packageManager,
        confidence: 'high',
        detectedFiles,
      };
    }

    // Nuxt
    if (deps['nuxt']) {
      return {
        framework: 'nuxt',
        runtime: 'node',
        buildCommand: 'npm run build',
        installCommand,
        outputDirectory: '.output',
        packageManager,
        confidence: 'high',
        detectedFiles,
      };
    }

    // SvelteKit
    if (deps['@sveltejs/kit']) {
      return {
        framework: 'sveltekit',
        runtime: 'node',
        buildCommand: 'npm run build',
        installCommand,
        outputDirectory: 'build',
        packageManager,
        confidence: 'high',
        detectedFiles,
      };
    }

    // React (CRA / Vite)
    if (deps['react']) {
      const isVite = !!deps['vite'];
      return {
        framework: 'react',
        runtime: 'static',
        buildCommand: 'npm run build',
        installCommand,
        outputDirectory: isVite ? 'dist' : 'build',
        packageManager,
        confidence: 'high',
        detectedFiles,
      };
    }

    // Vue
    if (deps['vue']) {
      return {
        framework: 'vue',
        runtime: 'static',
        buildCommand: 'npm run build',
        installCommand,
        outputDirectory: 'dist',
        packageManager,
        confidence: 'high',
        detectedFiles,
      };
    }

    // Angular
    if (deps['@angular/core']) {
      return {
        framework: 'angular',
        runtime: 'static',
        buildCommand: 'npm run build',
        installCommand,
        outputDirectory: 'dist',
        packageManager,
        confidence: 'high',
        detectedFiles,
      };
    }

    // Express / generic Node.js
    if (deps['express'] || deps['fastify'] || deps['koa']) {
      return {
        framework: deps['express'] ? 'express' : deps['fastify'] ? 'fastify' : 'koa',
        runtime: 'node',
        buildCommand: pkg.scripts?.build ? 'npm run build' : null,
        installCommand,
        outputDirectory: null,
        packageManager,
        confidence: 'medium',
        detectedFiles,
      };
    }

    // Generic JS with build script
    return {
      framework: 'node',
      runtime: pkg.scripts?.start ? 'node' : 'static',
      buildCommand: pkg.scripts?.build ? 'npm run build' : null,
      installCommand,
      outputDirectory: 'dist',
      packageManager,
      confidence: 'low',
      detectedFiles,
    };
  } catch {
    return defaultDetection();
  }
}

function defaultDetection(): FrameworkDetection {
  return {
    framework: null,
    runtime: null,
    buildCommand: null,
    installCommand: null,
    outputDirectory: null,
    packageManager: null,
    confidence: 'low',
    detectedFiles: [],
  };
}

async function fetchFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${token}`, ...GITHUB_HEADERS },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { content?: string; encoding?: string };
    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch {
    return null;
  }
}
