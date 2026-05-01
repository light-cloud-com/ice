/**
 * Pipeline Service — CI/CD deployment rules, webhook registration, framework detection
 *
 * Manages DeploymentRules that map GitHub push/merge events to deployments.
 * Registers webhooks on GitHub repos and processes incoming events.
 */

import prisma from '@ice/db';
import { emitPipelineUpdate, emitCardPipelineUpdate } from '@ice/shared';
// github.service functionality available via @ice/service-credentials if needed
import {
  GITHUB_API,
  GITHUB_HEADERS,
  type DeployStep,
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
export type { DeployStep, FrameworkDetection } from './pipeline/types.js';

// ─── Deployment Events ──────────────────────────────────────────────────────

export async function getEventsForNode(cardId: string, nodeId: string, limit = 20) {
  // Find all cards in the same project (rules are shared across environments)
  const card = await prisma.canvasCard.findUnique({ where: { id: cardId }, select: { project_id: true } });
  if (!card) return [];

  const projectCards = await prisma.canvasCard.findMany({
    where: { project_id: card.project_id },
    select: { id: true },
  });
  const cardIds = projectCards.map((c) => c.id);

  const rules = await prisma.deploymentRule.findMany({
    where: { card_id: { in: cardIds }, node_id: nodeId },
    select: { id: true },
  });
  const ruleIds = rules.map((r) => r.id);
  if (ruleIds.length === 0) return [];

  return prisma.deploymentEvent.findMany({
    where: { rule_id: { in: ruleIds } },
    orderBy: { started_at: 'desc' },
    take: limit,
    include: { rule: { select: { branch_pattern: true, environment: true } } },
  });
}

export async function createDeploymentEvent(
  ruleId: string,
  trigger: string,
  commitSha: string,
  branch: string,
  commitMessage?: string,
  commitAuthor?: string,
) {
  // Cancel any existing queued events for this rule
  await prisma.deploymentEvent.updateMany({
    where: { rule_id: ruleId, status: { in: ['queued'] } },
    data: { status: 'cancelled' },
  });

  return prisma.deploymentEvent.create({
    data: {
      rule_id: ruleId,
      trigger,
      commit_sha: commitSha,
      commit_message: commitMessage,
      commit_author: commitAuthor,
      branch,
      status: 'queued',
      deployment_stage: 'Queued for deployment',
      deployment_logs: [],
    },
  });
}

export async function updateEventProgress(eventId: string, status: string, stage: string, step?: DeployStep) {
  const event = await prisma.deploymentEvent.findUnique({ where: { id: eventId } });
  if (!event) return;

  const logs = (event.deployment_logs as unknown as DeployStep[]) || [];
  if (step) logs.push(step);

  const updates: any = {
    status,
    deployment_stage: stage,
    deployment_logs: logs,
  };

  if (status === 'success' || status === 'failed') {
    updates.completed_at = new Date();
    updates.duration_seconds = Math.round((Date.now() - event.started_at.getTime()) / 1000);
  }

  const updated = await prisma.deploymentEvent.update({
    where: { id: eventId },
    data: updates,
    include: { rule: true },
  });

  // Emit real-time updates
  emitPipelineUpdate(updated.rule.node_id, {
    nodeId: updated.rule.node_id,
    cardId: updated.rule.card_id,
    status: updated.status,
    deployment_stage: updated.deployment_stage,
    deployment_logs: updated.deployment_logs,
    commit_sha: updated.commit_sha,
    commit_message: updated.commit_message,
    commit_author: updated.commit_author,
    branch: updated.branch,
    progress: statusToProgress(updated.status),
    error: updated.error,
    started_at: updated.started_at.toISOString(),
    duration_seconds: updated.duration_seconds,
  });

  emitCardPipelineUpdate(updated.rule.card_id, {
    nodeId: updated.rule.node_id,
    status: updated.status,
    deployment_stage: updated.deployment_stage,
    commit_sha: updated.commit_sha,
    commit_message: updated.commit_message,
    progress: statusToProgress(updated.status),
  });

  return updated;
}

export async function failEvent(eventId: string, error: string) {
  const event = await prisma.deploymentEvent.findUnique({ where: { id: eventId } });
  if (!event) return;

  const logs = (event.deployment_logs as unknown as DeployStep[]) || [];
  logs.push({
    step: 'error',
    status: 'failed',
    message: error,
    timestamp: new Date().toISOString(),
  });

  return updateEventProgress(eventId, 'failed', `Failed: ${error}`, undefined);
}

// ─── Webhook Matching ───────────────────────────────────────────────────────

export async function matchRulesForPush(repository: string, branch: string, _commitSha: string) {
  const rules = await prisma.deploymentRule.findMany({
    where: {
      repository,
      enabled: true,
      trigger_type: 'push',
    },
  });

  return rules.filter((rule) => branchMatches(branch, rule.branch_pattern));
}

export async function matchRulesForMerge(repository: string, targetBranch: string) {
  const rules = await prisma.deploymentRule.findMany({
    where: {
      repository,
      enabled: true,
      trigger_type: 'merge',
    },
  });

  return rules.filter((rule) => branchMatches(targetBranch, rule.branch_pattern));
}

/**
 * Check if the last deployment for this rule had the same commit SHA and failed.
 * If so, skip to prevent infinite retry loops (same as platform pattern).
 */
export async function shouldSkipDuplicate(ruleId: string, commitSha: string): Promise<boolean> {
  const lastEvent = await prisma.deploymentEvent.findFirst({
    where: { rule_id: ruleId },
    orderBy: { started_at: 'desc' },
  });

  return !!(lastEvent && lastEvent.commit_sha === commitSha && lastEvent.status === 'failed');
}

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

function branchMatches(branch: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1); // "feature/"
    return branch.startsWith(prefix);
  }
  return branch === pattern;
}

function statusToProgress(status: string): number {
  switch (status) {
    case 'queued':
      return 0;
    case 'building':
      return 33;
    case 'deploying':
      return 66;
    case 'success':
      return 100;
    case 'failed':
      return 100;
    default:
      return 0;
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
