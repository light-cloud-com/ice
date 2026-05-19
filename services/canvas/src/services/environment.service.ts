/**
 * Environment Service — Canvas Branching
 *
 * Each environment owns a CanvasCard (1:1). Production is the "main branch."
 * Other environments are clones that can diverge and be promoted back.
 */

import prisma from '@ice/db';

const MAX_ENVIRONMENTS = 20;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnvironmentDiffItem {
  status: 'added' | 'removed' | 'modified';
  nodeId: string;
  label: string;
  iceType: string;
  sourceData?: Record<string, unknown>;
  targetData?: Record<string, unknown>;
  changedFields?: string[];
}

export interface EnvironmentDiff {
  added: EnvironmentDiffItem[];
  removed: EnvironmentDiffItem[];
  modified: EnvironmentDiffItem[];
  unchangedCount: number;
}

// ─── List ───────────────────────────────────────────────────────────────────

export async function listEnvironments(projectId: string) {
  return prisma.environment.findMany({
    where: { project_id: projectId },
    include: { card: { select: { id: true, name: true, updated_at: true } } },
    orderBy: [{ is_protected: 'desc' }, { created_at: 'asc' }],
  });
}

// ─── Bootstrap Production ───────────────────────────────────────────────────

export async function bootstrapProductionEnvironment(
  projectId: string,
  userId: string,
  projectName: string,
  existingCardId?: string,
) {
  // Check if production already exists
  const existing = await prisma.environment.findFirst({
    where: { project_id: projectId, type: 'production' },
  });
  if (existing) {
    // findings.md #15 — the previous unconditional return masked
    // stale callsites: a caller that thought it was seeding a fresh
    // env with their `existingCardId` got back the OLD env unchanged
    // and never noticed. The loud failure mode is preferable.
    if (existingCardId && existing.card_id !== existingCardId) {
      throw new Error(
        `Production environment already exists for project ${projectId} with card_id=${existing.card_id}; refused to attach to a different card_id=${existingCardId}.`,
      );
    }
    return existing;
  }

  return prisma.$transaction(async (tx) => {
    let cardId = existingCardId;

    if (!cardId) {
      const card = await tx.canvasCard.create({
        data: {
          name: `${projectName} — Production`,
          project_id: projectId,
          nodes: [],
          edges: [],
        },
      });
      cardId = card.id;
    }

    return tx.environment.create({
      data: {
        project_id: projectId,
        card_id: cardId,
        name: 'production',
        type: 'production',
        is_protected: true,
        created_by: userId,
      },
    });
  });
}

// ─── Create (clone from production) ─────────────────────────────────────────

export async function createEnvironment(
  projectId: string,
  userId: string,
  name: string,
  type: string,
  region?: string,
  prNumber?: number,
  prBranch?: string,
  prSourceRepo?: string,
) {
  // Enforce max
  const count = await prisma.environment.count({ where: { project_id: projectId } });
  if (count >= MAX_ENVIRONMENTS) {
    throw new Error(`Maximum ${MAX_ENVIRONMENTS} environments per project`);
  }

  // Find production card to clone from
  const prodEnv = await prisma.environment.findFirst({
    where: { project_id: projectId, type: 'production' },
    include: { card: true },
  });

  if (!prodEnv) {
    throw new Error('Production environment not found. Cannot clone.');
  }

  // Deep-copy nodes/edges
  const clonedNodes = JSON.parse(JSON.stringify(prodEnv.card.nodes));
  const clonedEdges = JSON.parse(JSON.stringify(prodEnv.card.edges));
  const clonedViewport = prodEnv.card.viewport ? JSON.parse(JSON.stringify(prodEnv.card.viewport)) : null;

  const envName = name.toLowerCase().replace(/\s+/g, '-');

  const result = await prisma.$transaction(async (tx) => {
    const card = await tx.canvasCard.create({
      data: {
        name: `${name}`,
        project_id: projectId,
        nodes: clonedNodes,
        edges: clonedEdges,
        viewport: clonedViewport,
      },
    });

    return tx.environment.create({
      data: {
        project_id: projectId,
        card_id: card.id,
        name: envName,
        type: type || 'development',
        region,
        is_protected: false,
        pr_number: prNumber,
        pr_branch: prBranch,
        pr_source_repo: prSourceRepo,
        created_by: userId,
      },
      include: { card: { select: { id: true, name: true, updated_at: true } } },
    });
  });

  // Auto-create trigger rules for the new environment by cloning production rules
  // findings.md #14 — the previous implementation wrapped EVERY step
  // (find-prod-rules + the per-rule create loop) in a single
  // try/catch and downgraded all errors to a console.warn. A
  // permission error or FK violation looked the same as "no prod
  // rules to clone", so users got a "created" status with zero rules
  // cloned. The reshape below scopes the catch to known
  // best-effort failures (P2002 unique-constraint on the per-rule
  // create) and lets everything else bubble to the route handler so
  // the caller sees a real 500 instead of a silent green path.
  const prodRules = await prisma.deploymentRule.findMany({
    where: { card_id: prodEnv.card_id },
  });

  const defaultBranch =
    envName === 'staging'
      ? 'staging'
      : envName === 'develop' || envName === 'development'
        ? 'develop'
        : type === 'pr' && prBranch
          ? prBranch
          : envName;

  for (const prodRule of prodRules) {
    const webhookSecret = (await import('crypto')).randomBytes(32).toString('hex');
    try {
      await prisma.deploymentRule.create({
        data: {
          card_id: result.card.id,
          node_id: prodRule.node_id,
          repository: prodRule.repository,
          trigger_type: prodRule.trigger_type,
          branch_pattern: defaultBranch,
          environment: envName,
          build_command: prodRule.build_command,
          install_command: prodRule.install_command,
          output_dir: prodRule.output_dir,
          framework: prodRule.framework,
          enabled: true,
          webhook_secret: webhookSecret,
          organisation_id: prodRule.organisation_id,
          created_by: userId,
        },
      });
    } catch (err: any) {
      // P2002 = unique constraint violation. That means a rule with
      // the same (card_id, node_id, repository, branch_pattern) tuple
      // already exists — expected when this codepath retries after a
      // partial failure. Anything else (FK violation, RLS deny,
      // permission error from the DB user, network) is a real failure
      // and should bubble.
      if (err?.code === 'P2002') {
        console.warn(`Trigger rule for node ${prodRule.node_id} already exists on env ${envName}; skipping clone.`);
        continue;
      }
      throw err;
    }
  }

  return result;
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateEnvironment(envId: string, data: { name?: string; region?: string }) {
  const env = await prisma.environment.findUnique({ where: { id: envId } });
  if (!env) throw new Error('Environment not found');
  if (env.is_protected && data.name) {
    throw new Error('Cannot rename the production environment');
  }

  const updates: any = {};
  if (data.name !== undefined) updates.name = data.name.toLowerCase().replace(/\s+/g, '-');
  if (data.region !== undefined) updates.region = data.region;

  return prisma.environment.update({
    where: { id: envId },
    data: updates,
    include: { card: { select: { id: true, name: true, updated_at: true } } },
  });
}

// ─── Delete ─────────────────────────────────────────────────────────────────

// findings.md #13 — CanvasDeployment statuses that mean "in flight".
// Anything outside this set is terminal (success / partial / failed /
// cancelled) and safe to leave behind when the parent card is deleted.
const ACTIVE_DEPLOYMENT_STATUSES = ['planning', 'planned', 'deploying'] as const;

export async function deleteEnvironment(envId: string) {
  const env = await prisma.environment.findUnique({ where: { id: envId } });
  if (!env) throw new Error('Environment not found');
  if (env.is_protected) throw new Error('Production environment cannot be deleted');

  // findings.md #13 — refuse to delete while a deployment is still in
  // flight. Without this check the canvasCard.delete cascades through
  // CanvasDeployment.card_id and the worker tearing down resources
  // either races against the cascade or finds its parent row gone.
  // Deploys that already finished (success/partial/failed/cancelled)
  // are not blocking — they're history rows.
  const activeDeploy = await prisma.canvasDeployment.findFirst({
    where: {
      card_id: env.card_id,
      status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] },
    },
    select: { id: true, status: true },
  });
  if (activeDeploy) {
    throw new Error(
      `Cannot delete environment while a deployment is in flight (id=${activeDeploy.id}, status=${activeDeploy.status}). Wait for it to finish or cancel it first.`,
    );
  }

  // Delete card (cascades to environment via the 1:1 relation)
  await prisma.canvasCard.delete({ where: { id: env.card_id } });
}

// ─── Compare (diff two environments) ────────────────────────────────────────

export async function compareEnvironments(sourceEnvId: string, targetEnvId: string): Promise<EnvironmentDiff> {
  const [sourceEnv, targetEnv] = await Promise.all([
    prisma.environment.findUnique({ where: { id: sourceEnvId }, include: { card: true } }),
    prisma.environment.findUnique({ where: { id: targetEnvId }, include: { card: true } }),
  ]);

  if (!sourceEnv || !targetEnv) throw new Error('Environment not found');

  return diffCardNodes(sourceEnv.card.nodes as any[], targetEnv.card.nodes as any[]);
}

// ─── Promote (overwrite target with source) ─────────────────────────────────

export async function promoteEnvironment(sourceEnvId: string, targetEnvId: string, userId: string) {
  const [sourceEnv, targetEnv] = await Promise.all([
    prisma.environment.findUnique({ where: { id: sourceEnvId }, include: { card: true } }),
    prisma.environment.findUnique({ where: { id: targetEnvId } }),
  ]);

  if (!sourceEnv || !targetEnv) throw new Error('Environment not found');
  if (targetEnv.type !== 'production') {
    throw new Error('Can only promote to the production environment');
  }

  // Overwrite production card with source card's content
  await prisma.canvasCard.update({
    where: { id: targetEnv.card_id },
    data: {
      nodes: sourceEnv.card.nodes as any,
      edges: sourceEnv.card.edges as any,
    },
  });

  // Queue a re-deploy of the production environment
  try {
    const rules = await prisma.deploymentRule.findMany({
      where: { card_id: targetEnv.card_id, enabled: true },
    });
    if (rules.length > 0) {
      const { createDeploymentEvent, getDeployQueue } = await import('@ice/service-deploy');
      const queue = getDeployQueue();

      for (const rule of rules) {
        const event = await createDeploymentEvent(
          rule.id,
          'manual',
          'promote',
          rule.branch_pattern,
          `Promoted from ${sourceEnv.name}`,
          userId,
        );
        await queue.add(
          'pipeline',
          {
            type: 'pipeline',
            eventId: event.id,
            ruleId: rule.id,
            cardId: targetEnv.card_id,
            nodeId: rule.node_id,
            repository: rule.repository,
            branch: rule.branch_pattern,
            commitSha: 'HEAD',
            environment: targetEnv.name,
            buildCommand: rule.build_command,
            installCommand: rule.install_command,
            outputDir: rule.output_dir,
            framework: rule.framework,
          },
          { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
        );
      }
    }
  } catch (err) {
    console.warn('Failed to queue re-deploy after promote:', err);
  }
}

// ─── Find by name (for pipeline resolution) ─────────────────────────────────

export async function findEnvironmentByName(projectId: string, name: string) {
  return prisma.environment.findFirst({
    where: { project_id: projectId, name },
    include: { card: { select: { id: true } } },
  });
}

// ─── Ephemeral PR environment cleanup ───────────────────────────────────────

export async function closePrEnvironment(sourceRepo: string, prNumber: number) {
  const envs = await prisma.environment.findMany({
    where: { pr_source_repo: sourceRepo, pr_number: prNumber },
  });

  for (const env of envs) {
    // Delete card (cascades to environment)
    await prisma.canvasCard.delete({ where: { id: env.card_id } }).catch(() => {});
  }
}

// ─── Toggle PR previews ─────────────────────────────────────────────────────

export async function togglePrPreviews(projectId: string, enabled: boolean) {
  await prisma.canvasProject.update({
    where: { id: projectId },
    data: { pr_previews_enabled: enabled },
  });
}

// ─── Diff Algorithm ─────────────────────────────────────────────────────────

function diffCardNodes(sourceNodes: any[], targetNodes: any[]): EnvironmentDiff {
  const sourceMap = new Map<string, any>();
  const targetMap = new Map<string, any>();

  for (const n of sourceNodes) sourceMap.set(n.id, n);
  for (const n of targetNodes) targetMap.set(n.id, n);

  const allIds = new Set([...sourceMap.keys(), ...targetMap.keys()]);

  const added: EnvironmentDiffItem[] = [];
  const removed: EnvironmentDiffItem[] = [];
  const modified: EnvironmentDiffItem[] = [];
  let unchangedCount = 0;

  for (const id of allIds) {
    const s = sourceMap.get(id);
    const t = targetMap.get(id);

    if (s && !t) {
      added.push({
        status: 'added',
        nodeId: id,
        label: s.data?.label || s.label || id,
        iceType: s.data?.iceType || '',
        sourceData: s.data,
      });
    } else if (!s && t) {
      removed.push({
        status: 'removed',
        nodeId: id,
        label: t.data?.label || t.label || id,
        iceType: t.data?.iceType || '',
        targetData: t.data,
      });
    } else if (s && t) {
      // Compare data, position, dimensions
      const sJson = JSON.stringify({ data: s.data, position: s.position, width: s.width, height: s.height });
      const tJson = JSON.stringify({ data: t.data, position: t.position, width: t.width, height: t.height });

      if (sJson !== tJson) {
        // Find which fields changed
        const changedFields: string[] = [];
        if (JSON.stringify(s.data) !== JSON.stringify(t.data)) {
          for (const key of new Set([...Object.keys(s.data || {}), ...Object.keys(t.data || {})])) {
            if (JSON.stringify(s.data?.[key]) !== JSON.stringify(t.data?.[key])) {
              changedFields.push(key);
            }
          }
        }
        if (JSON.stringify(s.position) !== JSON.stringify(t.position)) changedFields.push('position');

        modified.push({
          status: 'modified',
          nodeId: id,
          label: s.data?.label || s.label || id,
          iceType: s.data?.iceType || '',
          sourceData: s.data,
          targetData: t.data,
          changedFields,
        });
      } else {
        unchangedCount++;
      }
    }
  }

  return { added, removed, modified, unchangedCount };
}
