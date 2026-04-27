/**
 * deploy phase — open deploy panel, configure, plan, apply.
 *
 * On plan failure: classify error → run permitted recipes (per scenario) →
 * retry plan up to 2 times. On apply: stream #ice-deploy-log into
 * events.jsonl as deploy_log_tail events.
 */

import type { RunContext, PhaseResult } from '../context';
import { classifyDeployError, type ClassifiedError } from '../../../utils/error-classifier';
import { runRecipes } from '../recipes';

interface RequirementSummary {
  definitionId: string;
  title: string;
  description?: string;
  nodeId?: string;
  blocking: boolean;
  timing?: string;
  status: string;
  message?: string;
  isDns: boolean;
}

// Definition-IDs we consider DNS/domain/cert-related — these are external-action
// requirements that the harness deliberately won't fail on.
const DNS_PATTERN = /dns|domain|cert|tls|ssl/i;

/**
 * Pick the latest /canvas/deploy/requirements response out of a captured
 * action-log slice and turn it into a flat summary list with a DNS flag.
 */
function extractRequirements(events: Array<Record<string, unknown>>): RequirementSummary[] {
  const reqEvent = [...events].reverse().find((e) => {
    const target = String(e.target ?? '');
    return target.includes('/canvas/deploy/requirements') && e.action === 'api_response';
  });
  if (!reqEvent) return [];
  const detail = (reqEvent.detail as Record<string, unknown>) || {};
  const data = (detail.data as Record<string, unknown>) || {};
  const arr = Array.isArray(data.requirements) ? (data.requirements as Array<Record<string, unknown>>) : [];

  const out: RequirementSummary[] = [];
  for (const r of arr) {
    const result = (r.result as Record<string, unknown>) || {};
    const status = String(result.status ?? 'unknown');
    if (status === 'met' || status === 'verified') continue; // already satisfied
    const definitionId = String(r.definitionId ?? '');
    out.push({
      definitionId,
      title: String(r.title ?? '(untitled requirement)'),
      description: typeof r.description === 'string' ? r.description : undefined,
      nodeId: typeof r.nodeId === 'string' ? r.nodeId : undefined,
      blocking: r.blocking === true,
      timing: typeof r.timing === 'string' ? r.timing : undefined,
      status,
      message: typeof result.message === 'string' ? result.message : undefined,
      isDns: DNS_PATTERN.test(definitionId),
    });
  }
  return out;
}

/**
 * Format a requirements summary for note-event display.
 */
function formatRequirements(reqs: RequirementSummary[]): string {
  return reqs
    .map((r) => {
      const flag = r.blocking ? 'blocking' : 'warning';
      const dns = r.isDns ? ' [DNS-skip]' : '';
      const where = r.nodeId ? ` (node=${r.nodeId})` : '';
      const msg = r.message ? ` — ${r.message}` : '';
      return `  - [${flag}/${r.timing}/${r.status}]${dns} ${r.definitionId}: ${r.title}${where}${msg}`;
    })
    .join('\n');
}

async function drainActionLog(ctx: RunContext): Promise<Array<Record<string, unknown>>> {
  const { page, logger } = ctx;
  const log = (await page.evaluate(() => {
    const w = window as unknown as { __ICE_ACTION_LOG__?: Array<Record<string, unknown>> };
    const arr = w.__ICE_ACTION_LOG__ || [];
    w.__ICE_ACTION_LOG__ = [];
    return arr;
  })) as Array<Record<string, unknown>>;
  for (const ev of log) {
    const action = String(ev.action ?? '');
    const target = String(ev.target ?? '');
    const detail = (ev.detail as Record<string, unknown>) || {};
    const seq = Number(ev.seq ?? 0);
    if (action === 'api_call') {
      logger.emit({ kind: 'api_call', target, detail, appSeq: seq });
    } else if (action === 'api_response') {
      logger.emit({
        kind: 'api_response',
        target,
        status: Number(detail.status ?? 0),
        detail,
        appSeq: seq,
        durationMs: typeof ev.duration_ms === 'number' ? ev.duration_ms : undefined,
      });
    } else if (action === 'api_error' || ev.category === 'error') {
      logger.emit({
        kind: 'api_error',
        target,
        status: Number(detail.status ?? 0) || undefined,
        detail,
        appSeq: seq,
      });
    }
  }
  return log;
}

const MAX_PLAN_RETRIES = 2;

export async function runDeploy(ctx: RunContext): Promise<PhaseResult> {
  const { fixture, logger, scenario, page } = ctx;

  try {
    logger.setStep('open-panel');
    logger.emit({ kind: 'ui_action', action: 'click', selector: '#ice-btn-deploy' });
    await fixture.openDeployPanel();

    logger.setStep('configure');
    logger.emit({
      kind: 'ui_action',
      action: 'fill',
      selector: '#ice-deploy-input-project',
      args: { value: scenario.project.gcp.project, region: scenario.project.gcp.region },
    });
    await fixture.configureDeploy(scenario.project.gcp.project, scenario.project.gcp.region);

    // ── Plan with recipe retries ──────────────────────────────────────────
    let planResult: Awaited<ReturnType<typeof fixture.plan>> | undefined;
    for (let attempt = 0; attempt <= MAX_PLAN_RETRIES; attempt++) {
      logger.setStep(`plan:attempt-${attempt + 1}`);
      logger.emit({ kind: 'ui_action', action: 'click', selector: '#ice-deploy-btn-plan' });
      planResult = await fixture.plan();
      const drained = await drainActionLog(ctx);
      if (planResult.success) {
        logger.emit({
          kind: 'note',
          level: 'info',
          message: `Plan succeeded on attempt ${attempt + 1}`,
        });

        // Inspect deploy panel "Requirements" — these are checked in
        // parallel with plan and gate the Apply button. Save all to the
        // report; fail on non-DNS unmet ones (DNS/cert/domain are
        // external-action requirements and are logged-only by design).
        const requirements = extractRequirements(drained);
        if (requirements.length > 0) {
          logger.emit({
            kind: 'note',
            level: 'info',
            message: `Requirements (${requirements.length} unmet):\n${formatRequirements(requirements)}`,
          });
          const blockers = requirements.filter((r) => !r.isDns);
          if (blockers.length > 0) {
            const dnsCount = requirements.length - blockers.length;
            return {
              status: 'fail',
              error:
                `Deploy blocked by ${blockers.length} requirement(s): ` +
                blockers.map((b) => b.title).join('; ') +
                (dnsCount > 0 ? ` (plus ${dnsCount} DNS-related, logged only)` : ''),
            };
          }
        }
        break;
      }
      // classify + try recipes
      const classified = classifyDeployError(planResult.error || '', {
        phase: 'plan',
        gcpProject: scenario.project.gcp.project,
      });
      logger.emit({ kind: 'error_classified', classified, raw: planResult.error || '' });

      if (attempt === MAX_PLAN_RETRIES) {
        return { status: 'fail', error: `Plan failed after ${attempt + 1} attempts: ${planResult.error}` };
      }
      const recovered = await tryRecover(ctx, classified);
      if (!recovered) {
        return { status: 'fail', error: `Plan failed (no applicable recipe): ${classified.message}` };
      }
    }

    if (!planResult || !planResult.success) {
      return { status: 'fail', error: 'Plan failed' };
    }

    // record plan summary
    logger.emit({
      kind: 'note',
      level: 'info',
      message: `Plan: ${summarizePlan(planResult.plan)}`,
    });
    const skipReasons = extractSkipReasons(planResult.plan);
    if (skipReasons.length > 0) {
      logger.emit({
        kind: 'note',
        level: 'info',
        message: `Plan skipped:\n${skipReasons.map((s) => `  - ${s}`).join('\n')}`,
      });
    }

    const planShot = logger.screenshotPath('deploy-plan');
    await page.screenshot({ path: planShot });
    logger.emit({ kind: 'screenshot', path: planShot, reason: 'plan complete' });

    // ── Apply with log streaming ──────────────────────────────────────────
    logger.setStep('apply');
    logger.emit({ kind: 'ui_action', action: 'click', selector: '#ice-deploy-btn-apply' });

    const tailHandle = startLogTail(ctx);
    const applyResult = await fixture.apply();
    stopLogTail(tailHandle);
    await drainActionLog(ctx);

    ctx.applyResult = applyResult;

    const applyShot = logger.screenshotPath('deploy-apply');
    await page.screenshot({ path: applyShot });
    logger.emit({ kind: 'screenshot', path: applyShot, reason: 'apply complete' });

    if (!applyResult.success) {
      const classified = classifyDeployError(applyResult.error || '', {
        phase: 'apply',
        gcpProject: scenario.project.gcp.project,
      });
      logger.emit({ kind: 'error_classified', classified, raw: applyResult.error || '' });
      return { status: 'fail', error: `Apply failed: ${applyResult.error}` };
    }

    return { status: 'pass' };
  } catch (err) {
    return { status: 'fail', error: err instanceof Error ? err.message : String(err) };
  }
}

async function tryRecover(ctx: RunContext, classified: ClassifiedError): Promise<boolean> {
  const { logger, scenario } = ctx;
  if (!isAllowed(scenario, classified.category)) {
    logger.emit({
      kind: 'note',
      level: 'warn',
      message: `Recipe for category "${classified.category}" not allowed by scenario; skipping`,
    });
    return false;
  }
  const result = await runRecipes(ctx, classified);
  return result.fixed;
}

function isAllowed(scenario: RunContext['scenario'], category: string): boolean {
  const allow = scenario.recipes.allow;
  const forbid = scenario.recipes.forbid;
  if (forbid.includes('*' as any)) {
    return allow.includes(category as any);
  }
  if ((forbid as string[]).includes(category)) return false;
  return true;
}

function extractSkipReasons(plan: unknown): string[] {
  if (!plan || typeof plan !== 'object') return [];
  const top = plan as Record<string, unknown>;
  const inner =
    top.plan && typeof top.plan === 'object'
      ? (top.plan as Record<string, unknown>)
      : top;
  const skipped = Array.isArray(inner.skipped) ? (inner.skipped as Record<string, unknown>[]) : [];
  return skipped.map((s) => {
    const label = typeof s.label === 'string' ? s.label : (typeof s.nodeId === 'string' ? s.nodeId : '?');
    const reason = typeof s.reason === 'string' ? s.reason : 'no reason given';
    return `${label}: ${reason}`;
  });
}

function summarizePlan(plan: unknown): string {
  if (!plan || typeof plan !== 'object') return '(empty plan)';
  // The plan API returns { success, plan: { creates, updates, deletes,
  // skipped, deployable_count, ... }, deploymentId }. The fixture returns
  // the whole response body as `plan`, so dig into .plan if present.
  const top = plan as Record<string, unknown>;
  const inner =
    top.plan && typeof top.plan === 'object'
      ? (top.plan as Record<string, unknown>)
      : top;
  const arr = (k: string) => (Array.isArray(inner[k]) ? (inner[k] as unknown[]).length : 0);
  const creates = arr('creates');
  const updates = arr('updates');
  const deletes = arr('deletes');
  const skipped = arr('skipped');
  const deployable =
    typeof inner.deployable_count === 'number' ? inner.deployable_count : creates + updates + deletes;
  return (
    `creates=${creates} updates=${updates} deletes=${deletes}` +
    (skipped > 0 ? ` skipped=${skipped}` : '') +
    ` deployable=${deployable}`
  );
}

// ─── log tail ──────────────────────────────────────────────────────────────

interface TailHandle {
  timer: NodeJS.Timeout;
}

function startLogTail(ctx: RunContext): TailHandle {
  const { page, logger } = ctx;
  let emitted = 0;
  const timer = setInterval(async () => {
    try {
      // Each log entry is its own <div> child of #ice-deploy-log; read them
      // separately so we don't have to reverse-engineer line boundaries
      // from a flat textContent blob.
      const lines = await page
        .locator('#ice-deploy-log > div')
        .allTextContents()
        .catch(() => [] as string[]);
      // The trailing <div ref={logEndRef}/> is empty — strip empties.
      const cleaned = lines.map((l) => l.replace(/^\s*\d+\s*/, '').trim()).filter(Boolean);
      for (let i = emitted; i < cleaned.length; i++) {
        const line = cleaned[i];
        logger.emit({ kind: 'deploy_log_tail', text: line });
        process.stdout.write(`[deploy] ${line}\n`);
      }
      emitted = cleaned.length;
    } catch {
      /* ignore poll errors */
    }
  }, 1500);
  return { timer };
}

function stopLogTail(h: TailHandle): void {
  clearInterval(h.timer);
}
