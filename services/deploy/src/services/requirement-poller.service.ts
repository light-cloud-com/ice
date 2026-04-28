/**
 * Requirement Background Poller (Phase 8)
 *
 * Periodically re-checks post-deploy requirements whose status is still
 * `unmet` or `unknown` and whose `last_checked_at` is older than the
 * requirement's `verifyPollIntervalMs`. Emits a `requirement_verified`
 * socket event when a row flips so the UI can update live.
 *
 * Scope limits:
 *   - max 10 concurrent checks per tick
 *   - hard stop when a row exceeds its `verifyTimeoutMs` budget
 *   - runs every 30 seconds in the same gateway process
 *
 * State lives in `block_requirement_status`, so restarts don't lose
 * polling progress — the next tick picks up where the previous one left
 * off. The poller is safe to run on multiple gateways simultaneously
 * (checks are idempotent) though we only start it once.
 */

import { BUILT_IN_REQUIREMENTS, type RequirementContext } from '@ice/blocks/requirements';
import prisma from '@ice/db';
import { emitDeployRequirementVerified } from '@ice/shared';
import type { DeployRequirementVerifiedEvent } from '@ice/types';
import { checkSearchConsoleVerification, fetchSslCertificateStatus } from './google-verification.service.js';
import { getResourceMap } from './resource-mapping.service.js';

const POLL_INTERVAL_MS = 30_000;
const MAX_CONCURRENT = 10;

let timer: NodeJS.Timeout | undefined;

export function startRequirementPoller(): void {
  if (timer) return;
  timer = setInterval(() => {
    runTick().catch((err) => {
      console.warn('[requirement-poller] tick failed:', err?.message || err);
    });
  }, POLL_INTERVAL_MS);
  // Don't keep the process alive solely for this poller.
  if (typeof timer.unref === 'function') timer.unref();
  console.log('[requirement-poller] started');
}

export function stopRequirementPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

interface PollerRow {
  id: string;
  card_id: string;
  node_id: string;
  environment: string;
  requirement_id: string;
  status: string;
  last_checked_at: Date;
  verified_at: Date | null;
}

async function runTick(): Promise<void> {
  const now = Date.now();
  // Pull every row that might be due for a re-check. We fetch a bit more
  // than we'll process because the per-requirement interval varies.
  const candidates = (await prisma.blockRequirementStatus.findMany({
    where: {
      status: { in: ['unmet', 'unknown', 'checking'] },
    },
    orderBy: { last_checked_at: 'asc' },
    take: 200,
  })) as PollerRow[];

  const due = candidates.filter((row) => {
    const def = BUILT_IN_REQUIREMENTS.find((d) => d.id === row.requirement_id);
    if (!def || def.timing !== 'post-deploy') return false;
    const interval = def.verifyPollIntervalMs ?? 60_000;
    const age = now - row.last_checked_at.getTime();
    return age >= interval;
  });

  if (due.length === 0) return;

  // Process up to MAX_CONCURRENT in parallel, then the next batch, etc.
  for (let i = 0; i < due.length; i += MAX_CONCURRENT) {
    const batch = due.slice(i, i + MAX_CONCURRENT);
    await Promise.all(batch.map((row) => checkOne(row).catch(() => undefined)));
  }
}

async function checkOne(row: PollerRow): Promise<void> {
  const def = BUILT_IN_REQUIREMENTS.find((d) => d.id === row.requirement_id);
  if (!def || !def.check) return;

  // Find the canvas card so we have the block data to evaluate the check.
  const card = await prisma.canvasCard.findUnique({ where: { id: row.card_id } });
  if (!card) return;

  const nodes = (card.nodes as any[]) || [];
  const node = nodes.find((n) => n.id === row.node_id);
  if (!node) return;

  // Check whether we're past the requirement's global timeout window.
  const ageSinceFirstCheck = Date.now() - row.last_checked_at.getTime();
  if (def.verifyTimeoutMs && ageSinceFirstCheck > def.verifyTimeoutMs) {
    await prisma.blockRequirementStatus
      .update({
        where: { id: row.id },
        data: { status: 'expired', last_checked_at: new Date() },
      })
      .catch(() => undefined);
    return;
  }

  // We don't currently know which org owns the card from the row alone.
  // Look it up via the card's project.
  const project = await prisma.canvasProject.findUnique({
    where: { id: card.project_id },
    select: { organisation_id: true },
  });
  const orgId = project?.organisation_id;
  if (!orgId) return;

  const mapping = await getResourceMap(row.card_id, row.environment);
  const mapped = mapping.get(row.node_id);

  const ctx = {
    block: { id: row.node_id, data: node.data || {} },
    cardId: row.card_id,
    environment: row.environment,
    gcpProject: mapped?.providerId ? extractProject(mapped.providerId) : undefined,
    org: { id: orgId },
    providerId: mapped?.providerId,
    certResourceName: mapped?.name,
    googleVerifier: {
      checkVerification: checkSearchConsoleVerification,
    },
    certStatusChecker: {
      fetchStatus: fetchSslCertificateStatus,
    },
  } as RequirementContext;

  try {
    const result = await def.check(ctx);
    const nextStatus = result.status;
    const nowVerified = nextStatus === 'verified';

    await prisma.blockRequirementStatus.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        message: result.message ?? null,
        last_checked_at: new Date(),
        verified_at: nowVerified ? new Date() : row.verified_at,
        details: (result.details as any) ?? null,
      },
    });

    // Notify the UI on every status check so the PublicEndpoint /
    // Custom Domain block headers can show live "Provisioning…" /
    // "Active" status without waiting for the user to redeploy.
    //
    // Carries the full unique key `(card_id, node_id, environment,
    // requirement)` plus an optional `details` blob — without `node_id`
    // + `environment`, a frontend reducer can't disambiguate between
    // the same requirement applied to two blocks (or one block across
    // environments). Fires OUTSIDE an active deploy, so `seq` uses the
    // `Date.now()` scheme documented on `DeployRequirementVerifiedEvent.seq`.
    try {
      const event: DeployRequirementVerifiedEvent = {
        type: 'requirement_verified',
        card_id: row.card_id,
        node_id: row.node_id,
        environment: row.environment,
        requirement: row.requirement_id,
        status: nowVerified ? 'satisfied' : 'unsatisfied',
        details: result.details,
        at: new Date().toISOString(),
        seq: Date.now(),
      };
      emitDeployRequirementVerified(row.card_id, event);
    } catch {
      // Non-fatal.
    }
  } catch (err: any) {
    await prisma.blockRequirementStatus
      .update({
        where: { id: row.id },
        data: {
          status: 'unmet',
          message: `Check failed: ${err?.message || err}`,
          last_checked_at: new Date(),
        },
      })
      .catch(() => undefined);
  }
}

function extractProject(providerId: string): string | undefined {
  // providerId shapes:
  //   projects/<project>/global/sslCertificates/<name>
  //   projects/<project>/locations/<region>/services/<name>
  //   gs://<bucket>
  const match = providerId.match(/^projects\/([^/]+)\//);
  return match?.[1];
}
