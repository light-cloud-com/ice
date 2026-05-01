/**
 * Pipeline Service — CI/CD deployment rules, webhook registration, framework detection
 *
 * Manages DeploymentRules that map GitHub push/merge events to deployments.
 * Registers webhooks on GitHub repos and processes incoming events.
 */

import prisma from '@ice/db';
// github.service functionality available via @ice/service-credentials if needed
import {
  GITHUB_API,
  GITHUB_HEADERS,
  type FrameworkDetection,
} from './pipeline/types.js';
import { getGitHubToken } from './pipeline/github-webhooks.js';

export {
  ensureRulesForCanvas,
  createRule,
  updateRule,
  deleteRule,
  getRulesForNode,
} from './pipeline/rule-management.js';
export {
  getEventsForNode,
  createDeploymentEvent,
  updateEventProgress,
  failEvent,
} from './pipeline/events.js';
export {
  matchRulesForPush,
  matchRulesForMerge,
  shouldSkipDuplicate,
} from './pipeline/rule-matching.js';
export type { DeployStep, FrameworkDetection } from './pipeline/types.js';

// ─── Framework Detection ────────────────────────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Environment Resolution (for Canvas Branching) ──────────────────────────

/**
 * Given a card_id from a DeploymentRule and an environment name,
 * find the project that owns that card, then find the environment
 * by name, and return its card_id. Falls back to the original cardId.
 */
export async function resolveEnvironmentCardId(ruleCardId: string, environmentName: string): Promise<string> {
  try {
    const card = await prisma.canvasCard.findUnique({
      where: { id: ruleCardId },
      select: { project_id: true },
    });
    if (!card) return ruleCardId;

    const env = await prisma.environment.findFirst({
      where: { project_id: card.project_id, name: environmentName },
      select: { card_id: true },
    });

    return env?.card_id ?? ruleCardId;
  } catch {
    return ruleCardId;
  }
}
