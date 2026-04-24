/**
 * Pipeline Service — CI/CD deployment rules, webhook registration, framework detection
 *
 * Manages DeploymentRules that map GitHub push/merge events to deployments.
 * Registers webhooks on GitHub repos and processes incoming events.
 */

import crypto from 'crypto';
import prisma from '@ice/db';
import { emitPipelineUpdate, emitCardPipelineUpdate } from '@ice/shared';
// github.service functionality available via @ice/service-credentials if needed

// ─── Types ──────────────────────────────────────────────────────────────────

interface CreateRuleInput {
  cardId: string;
  nodeId: string;
  repository: string; // "owner/repo"
  triggerType?: string; // "push" | "merge"
  branchPattern?: string; // "main" | "develop" | "feature/*"
  environment?: string; // "production" | "staging" | "development"
  buildCommand?: string;
  installCommand?: string;
  outputDir?: string;
  framework?: string;
}

export interface DeployStep {
  step: string;
  status: 'started' | 'completed' | 'failed';
  message: string;
  timestamp: string;
  duration_ms?: number;
}

export interface FrameworkDetection {
  framework: string | null;
  runtime: string | null;
  buildCommand: string | null;
  installCommand: string | null;
  outputDirectory: string | null;
  packageManager: string | null;
  confidence: 'high' | 'medium' | 'low';
  detectedFiles: string[];
}

// ─── Auto-create rules from canvas edges ────────────────────────────────────

/**
 * Walk the deploy graph for Source.Repository → Compute edges and ensure
 * a DeploymentRule + GitHub webhook exists for each pair. Idempotent —
 * if a rule already exists, it's left alone (createRule's existing
 * findFirst+update path handles that).
 *
 * Why this lives here and not in the UI properties panel: the user
 * shouldn't have to click into the Source.Repository block's properties
 * just to enable push-to-deploy. The deploy is the moment they say "I
 * want this connected to my repo" — so we set up the webhook then.
 *
 * Returns the rules that were created or adopted, plus any errors so
 * the caller can surface them in the deploy log without failing the
 * deploy itself.
 */
export async function ensureRulesForCanvas(
  cardId: string,
  nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
  edges: Array<{ source: string; target: string }>,
  organisationId: string,
  userId: string,
  defaultEnvironment: string,
): Promise<{
  created: Array<{ ruleId: string; nodeId: string; repository: string; webhookStatus?: string }>;
  errors: Array<{ nodeId: string; repository: string; error: string }>;
}> {
  const created: Array<{ ruleId: string; nodeId: string; repository: string; webhookStatus?: string }> = [];
  const errors: Array<{ nodeId: string; repository: string; error: string }> = [];

  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    const src = nodesById.get(edge.source);
    const dst = nodesById.get(edge.target);
    if (!src || !dst) continue;

    let repoNode: typeof src;
    let computeNode: typeof src;
    if ((src.data?.iceType as string) === 'Source.Repository') {
      repoNode = src;
      computeNode = dst;
    } else if ((dst.data?.iceType as string) === 'Source.Repository') {
      repoNode = dst;
      computeNode = src;
    } else {
      continue;
    }

    const computeIce = (computeNode.data?.iceType as string) || '';
    if (!computeIce.startsWith('Compute.')) continue;

    // Repo data lives on the Source.Repository node OR (if the user
    // typed it directly into the compute block's properties) on the
    // compute node itself. Prefer the source node value.
    const repository = String(
      repoNode.data?.repository || (computeNode.data as any)?.repository || '',
    ).trim();
    if (!repository) continue;

    const branch = String(repoNode.data?.branch || (computeNode.data as any)?.branch || 'main').trim() || 'main';
    const buildCommand = String(repoNode.data?.buildCommand || '').trim() || undefined;
    const installCommand = String(repoNode.data?.installCommand || '').trim() || undefined;
    const outputDir = String(repoNode.data?.outputDirectory || '').trim() || undefined;
    const framework = String(repoNode.data?.framework || (computeNode.data as any)?.framework || '').trim() || undefined;

    try {
      const rule = await createRule(
        {
          cardId,
          nodeId: computeNode.id,
          repository,
          triggerType: 'push',
          branchPattern: branch,
          environment: defaultEnvironment,
          buildCommand,
          installCommand,
          outputDir,
          framework,
        },
        organisationId,
        userId,
      );
      created.push({
        ruleId: rule.id,
        nodeId: computeNode.id,
        repository,
        webhookStatus: (rule as any).webhook_status,
      });
    } catch (err: any) {
      errors.push({ nodeId: computeNode.id, repository, error: err?.message || String(err) });
    }
  }

  return { created, errors };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com';
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

// ─── Rule CRUD ──────────────────────────────────────────────────────────────

export async function createRule(input: CreateRuleInput, organisationId: string, userId: string) {
  const branchPattern = input.branchPattern || 'main';

  // Idempotent by design: if a rule for this (card_id, node_id, branch_pattern)
  // already exists, return it and update any changed fields. The DB has a
  // unique index on those three columns, so a blind `.create()` throws
  // P2002 on the second call. Callers (the UI, React StrictMode double-
  // mount, tests) legitimately re-trigger creation and expect idempotency.
  const existing = await prisma.deploymentRule.findFirst({
    where: {
      card_id: input.cardId,
      node_id: input.nodeId,
      branch_pattern: branchPattern,
    },
  });

  if (existing) {
    // Update mutable fields (repository, framework, commands, environment)
    // but keep the webhook_secret / webhook_id stable — rotating the
    // secret would invalidate the existing GitHub webhook.
    const updated = await prisma.deploymentRule.update({
      where: { id: existing.id },
      data: {
        repository: input.repository,
        trigger_type: input.triggerType || existing.trigger_type,
        environment: input.environment || existing.environment,
        build_command: input.buildCommand ?? existing.build_command,
        install_command: input.installCommand ?? existing.install_command,
        output_dir: input.outputDir ?? existing.output_dir,
        framework: input.framework ?? existing.framework,
      },
    });
    return {
      ...updated,
      webhook_status: existing.webhook_status,
      webhook_error: existing.webhook_error,
    };
  }

  const webhookSecret = crypto.randomBytes(32).toString('hex');

  const rule = await prisma.deploymentRule.create({
    data: {
      card_id: input.cardId,
      node_id: input.nodeId,
      repository: input.repository,
      trigger_type: input.triggerType || 'push',
      branch_pattern: branchPattern,
      environment: input.environment || 'production',
      build_command: input.buildCommand,
      install_command: input.installCommand,
      output_dir: input.outputDir,
      framework: input.framework,
      webhook_secret: webhookSecret,
      organisation_id: organisationId,
      created_by: userId,
    },
  });

  // Register webhook on GitHub (best-effort — don't fail rule creation).
  //
  // Webhook registration is a separate concern from the rule itself: the
  // rule is useful even without a webhook (manual triggers still work),
  // and fine-grained PATs often lack the repo:admin permission needed to
  // create webhooks. Previously the caller only saw a generic stack trace
  // in the gateway log; now the failure mode and remediation are stored
  // on the rule row and surfaced to the UI via `webhook_status` /
  // `webhook_error`.
  const webhookResult = await registerGitHubWebhook(userId, input.repository, webhookSecret);
  await prisma.deploymentRule.update({
    where: { id: rule.id },
    data: {
      webhook_id: webhookResult.webhookId,
      webhook_status: webhookResult.status,
      webhook_error: webhookResult.error,
    },
  });

  if (webhookResult.status === 'failed') {
    // Single clean warning line — no stack trace, no misleading "Error:"
    // prefix. The details are persisted on the rule for the UI to show.
    console.warn(
      `[pipeline] Webhook not registered for ${input.repository} — ${webhookResult.error}. ` +
        `The rule was created and works for manual deploys; auto-deploy on push will not trigger until this is resolved.`,
    );
  }

  return { ...rule, webhook_status: webhookResult.status, webhook_error: webhookResult.error };
}

export async function updateRule(
  ruleId: string,
  updates: Partial<CreateRuleInput> & { enabled?: boolean },
  organisationId: string,
) {
  return prisma.deploymentRule.update({
    where: { id: ruleId, organisation_id: organisationId },
    data: {
      trigger_type: updates.triggerType,
      branch_pattern: updates.branchPattern,
      environment: updates.environment,
      build_command: updates.buildCommand,
      install_command: updates.installCommand,
      output_dir: updates.outputDir,
      framework: updates.framework,
      enabled: updates.enabled,
    },
  });
}

export async function deleteRule(ruleId: string, userId: string, organisationId: string) {
  const rule = await prisma.deploymentRule.findFirst({
    where: { id: ruleId, organisation_id: organisationId },
  });
  if (!rule) throw new Error('Rule not found');

  // Remove webhook from GitHub (best-effort)
  if (rule.webhook_id) {
    try {
      await unregisterGitHubWebhook(userId, rule.repository, rule.webhook_id);
    } catch (err) {
      console.warn(`Failed to remove webhook ${rule.webhook_id}:`, err);
    }
  }

  await prisma.deploymentRule.delete({ where: { id: ruleId } });
}

export async function getRulesForNode(cardId: string, nodeId: string) {
  // Find all cards in the same project (for Canvas Branching — rules are shared across environments)
  const card = await prisma.canvasCard.findUnique({ where: { id: cardId }, select: { project_id: true } });
  if (!card) return [];

  const projectCards = await prisma.canvasCard.findMany({
    where: { project_id: card.project_id },
    select: { id: true },
  });
  const cardIds = projectCards.map((c) => c.id);

  return prisma.deploymentRule.findMany({
    where: { card_id: { in: cardIds }, node_id: nodeId },
    orderBy: { created_at: 'asc' },
  });
}

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

// ─── GitHub Webhook Registration ────────────────────────────────────────────

interface WebhookRegistrationResult {
  status: 'registered' | 'failed' | 'skipped';
  webhookId?: number;
  error?: string;
}

async function registerGitHubWebhook(
  userId: string,
  repository: string,
  secret: string,
): Promise<WebhookRegistrationResult> {
  const token = await getGitHubToken(userId);
  if (!token) {
    return {
      status: 'skipped',
      error: 'GitHub is not connected. Connect GitHub in Settings to enable auto-deploy on push.',
    };
  }

  const callbackUrl = getWebhookCallbackUrl();
  const [owner, repo] = repository.split('/');

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...GITHUB_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push', 'pull_request'],
        config: {
          url: callbackUrl,
          content_type: 'json',
          secret,
          insecure_ssl: '0',
        },
      }),
    });
  } catch (err: any) {
    return {
      status: 'failed' as const,
      error: `Network error contacting GitHub: ${err?.message || err}`,
    };
  }

  if (response.ok) {
    const hook = (await response.json()) as { id: number };
    return { status: 'registered' as const, webhookId: hook.id };
  }

  const text = await response.text().catch(() => '');
  // 422 = hook already exists for this URL — treat as success with no new id.
  if (response.status === 422 && text.includes('already exists')) {
    return { status: 'registered' as const };
  }
  // 403 on webhook creation is the classic "PAT doesn't have repo:admin"
  // or "user doesn't have admin rights on this org repo" case. Surface it
  // with a clear remediation hint rather than the raw GitHub message.
  if (response.status === 403) {
    return {
      status: 'failed' as const,
      error:
        `GitHub denied webhook creation (403). Your token needs 'repo' scope and admin access to ${repository}. ` +
        `If this is an organization repo you don't own, auto-deploy on push won't work until an owner sets up the webhook.`,
    };
  }
  if (response.status === 401) {
    return {
      status: 'failed' as const,
      error: 'GitHub token is invalid or expired. Reconnect GitHub in Settings → Integrations.',
    };
  }
  if (response.status === 404) {
    return {
      status: 'failed' as const,
      error: `Repository ${repository} not found or not accessible by your token.`,
    };
  }
  return {
    status: 'failed' as const,
    error: `GitHub returned ${response.status}: ${text.slice(0, 200)}`,
  };
}

async function unregisterGitHubWebhook(userId: string, repository: string, webhookId: number) {
  const token = await getGitHubToken(userId);
  if (!token) return;

  const [owner, repo] = repository.split('/');

  await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks/${webhookId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      ...GITHUB_HEADERS,
    },
  });
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

async function getGitHubToken(userId: string): Promise<string | null> {
  const record = await prisma.gitHubToken.findUnique({ where: { user_id: userId } });
  if (!record) return null;
  try {
    const { decryptString } = await import('@ice/shared');
    return decryptString(record.access_token);
  } catch {
    return record.access_token;
  }
}

function getWebhookCallbackUrl(): string {
  const baseUrl = process.env.WEBHOOK_BASE_URL || process.env.BACKEND_URL || 'http://localhost:5001';
  return `${baseUrl}/api/webhooks/github`;
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
