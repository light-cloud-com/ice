/**
 * design phase — drag each block onto the canvas, set its properties, then
 * connect them per the scenario. After every block + connection, drain the
 * ICE action log for warnings/errors, classify, and try recipes.
 */

import type { RunContext, PhaseResult } from '../context';
import { classifyDeployError } from '../../../utils/error-classifier';

export async function runDesign(ctx: RunContext): Promise<PhaseResult> {
  const { canvas, props, logger, scenario, page, nodeIdByAlias } = ctx;

  try {
    // Apply per-iceType property overrides to template-loaded nodes. Used
    // to fill in user-supplied fields (e.g. Source.Repository.repository)
    // that the template leaves empty.
    await applyTemplateOverrides(ctx);

    if (scenario.blocks.length === 0 && scenario.connections.length === 0) {
      logger.note('No extra blocks or connections; deploying template as-is.');
      // Even template-only scenarios should respect canvas validation:
      // surface issues from useCanvasValidation, fail on errors.
      const validateResult = await checkCanvasValidation(ctx);
      return validateResult;
    }

    // Place each block. Layout: simple horizontal lane.
    for (let i = 0; i < scenario.blocks.length; i++) {
      const block = scenario.blocks[i];
      logger.setStep(`add-block:${block.id}`);
      logger.note(`Adding block ${block.id} (${block.type})`);

      const slot = canvas.laneSlot(i, scenario.blocks.length);
      const placed = await canvas.addBlock(block.type, slot);
      nodeIdByAlias.set(block.id, placed.nodeId);

      const shotPath = logger.screenshotPath(`design-${block.id}-placed`);
      await page.screenshot({ path: shotPath });
      logger.emit({ kind: 'screenshot', path: shotPath, reason: 'block placed' });

      // Properties — select the new block first.
      if (Object.keys(block.properties).length > 0) {
        await canvas.selectBlock(placed.nodeId);
        await page.waitForTimeout(400); // panel mount

        await props.applyProperties(block.properties);
        const shot2 = logger.screenshotPath(`design-${block.id}-props`);
        await page.screenshot({ path: shot2 });
        logger.emit({ kind: 'screenshot', path: shot2, reason: 'block properties set' });
      }

      await drainAndClassify(ctx, `block:${block.id}`);
    }

    // Connections.
    for (const conn of scenario.connections) {
      logger.setStep(`connect:${conn.from}->${conn.to}`);
      const fromId = nodeIdByAlias.get(conn.from);
      const toId = nodeIdByAlias.get(conn.to);
      if (!fromId || !toId) {
        return {
          status: 'fail',
          error: `connection refs unknown alias: ${conn.from} -> ${conn.to}`,
        };
      }
      logger.note(`Connecting ${conn.from} → ${conn.to}`);
      await canvas.connectBlocks(fromId, toId);
      await page.waitForTimeout(300);

      const shot = logger.screenshotPath(`design-conn-${conn.from}-${conn.to}`);
      await page.screenshot({ path: shot });
      logger.emit({ kind: 'screenshot', path: shot, reason: 'connection drawn' });

      await drainAndClassify(ctx, `connect:${conn.from}-${conn.to}`);
    }

    return checkCanvasValidation(ctx);
  } catch (err) {
    const shot = logger.screenshotPath('design-fail');
    await page.screenshot({ path: shot }).catch(() => undefined);
    logger.emit({ kind: 'screenshot', path: shot, reason: 'design phase failed' });
    return { status: 'fail', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Walk scenario.templateOverrides; for each iceType, find every matching
 * node on the canvas and apply the listed properties via the properties
 * panel. Used to fill in user-supplied fields (Source.Repository URL,
 * Custom Domain root, etc.) that templates intentionally leave empty.
 */
async function applyTemplateOverrides(ctx: RunContext): Promise<void> {
  const { scenario, canvas, props, page, logger } = ctx;
  const overrides = scenario.templateOverrides ?? {};
  const entries = Object.entries(overrides);
  if (entries.length === 0) return;

  const nodes = await canvas.getNodes();
  if (nodes.length === 0) {
    // Diagnostic: dump everything that has a data-node-id, so we can tell
    // whether data-ice-type is actually being emitted by the renderer.
    const sample = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[data-node-id]')) as Element[];
      return els.slice(0, 20).map((el) => ({
        tag: el.tagName,
        nodeId: el.getAttribute('data-node-id'),
        iceType: el.getAttribute('data-ice-type'),
        cls: el.getAttribute('class')?.slice(0, 80),
        attrs: Array.from(el.attributes).map((a) => a.name).join(','),
      }));
    });
    logger.emit({
      kind: 'note',
      level: 'warn',
      message: `templateOverrides: getNodes() returned 0; DOM sample of [data-node-id] elements:\n${JSON.stringify(sample, null, 2)}`,
    });
  }
  for (const [iceType, properties] of entries) {
    const matches = nodes.filter((n) => n.iceType === iceType);
    if (matches.length === 0) {
      logger.note(`templateOverrides: no nodes match iceType "${iceType}"`, 'warn');
      continue;
    }
    for (const node of matches) {
      logger.setStep(`override:${iceType}:${node.nodeId}`);
      logger.note(`Applying override to ${iceType} (node=${node.nodeId})`);
      await canvas.selectBlock(node.nodeId);
      await page.waitForTimeout(300);
      await props.applyProperties(properties as Record<string, unknown>);
    }
  }
  logger.setStep('overrides-applied');
}

/**
 * Read window.__ICE_VALIDATION__ (populated by useCanvasValidation when
 * the action-log flag is enabled) and surface every issue. Errors fail the
 * design phase; warnings/info are logged and pass.
 */
async function checkCanvasValidation(ctx: RunContext): Promise<PhaseResult> {
  const { page, logger } = ctx;
  // Validation runs on a 500ms debounce after canvas changes, so give it
  // time to settle. Try a few times in case the window value hasn't been
  // written yet.
  let state: {
    issues?: Array<{ severity: string; category: string; code: string; message: string; suggestion?: string; nodeId?: string; propertyPath?: string }>;
    valid?: boolean;
    deployable?: boolean;
    summary?: { errors: number; warnings: number; info: number };
    validatedAt?: string;
  } | null = null;
  for (let i = 0; i < 8; i++) {
    state = await page.evaluate(() => {
      const w = window as unknown as { __ICE_VALIDATION__?: unknown };
      return w.__ICE_VALIDATION__ ?? null;
    });
    if (state && state.validatedAt) break;
    await page.waitForTimeout(250);
  }
  if (!state) {
    logger.note('Canvas validation state not exposed on window — skipping validation gate', 'warn');
    return { status: 'pass' };
  }

  const summary = state.summary ?? { errors: 0, warnings: 0, info: 0 };
  logger.note(
    `Canvas validation: ${state.valid ? 'valid' : 'invalid'}, deployable=${state.deployable} ` +
      `(errors=${summary.errors} warnings=${summary.warnings} info=${summary.info})`,
  );

  const issues = state.issues ?? [];
  if (issues.length > 0) {
    const formatted = issues
      .map((i) => `  - [${i.severity}/${i.category}] ${i.code}: ${i.message}${i.suggestion ? ` — ${i.suggestion}` : ''}${i.nodeId ? ` (node=${i.nodeId})` : ''}`)
      .join('\n');
    logger.emit({
      kind: 'note',
      level: summary.errors > 0 ? 'error' : 'warn',
      message: `Validation issues:\n${formatted}`,
    });
  }

  // Both errors AND warnings block by default — Playwright takes care of
  // every validation issue, not just the deploy-fatal ones. Scenarios can
  // opt out per-warning via `validation.allowWarnings: ['CODE', ...]` or
  // disable the warning gate entirely with `validation.allowWarnings: '*'`.
  const allow = ctx.scenario.validation?.allowWarnings ?? [];
  const allowAllWarnings = allow === '*';
  const allowedCodes = Array.isArray(allow) ? new Set(allow) : new Set<string>();

  const blockingErrors = issues.filter((i) => i.severity === 'error');
  const blockingWarnings = issues.filter(
    (i) => i.severity === 'warning' && !allowAllWarnings && !allowedCodes.has(i.code),
  );

  if (blockingErrors.length > 0 || blockingWarnings.length > 0 || state.deployable === false) {
    const reasons: string[] = [];
    if (blockingErrors.length > 0) reasons.push(`${blockingErrors.length} error(s)`);
    if (blockingWarnings.length > 0) reasons.push(`${blockingWarnings.length} warning(s)`);
    if (state.deployable === false) reasons.push('not deployable');
    return {
      status: 'fail',
      error: `Canvas validation: ${reasons.join(', ')}`,
    };
  }
  return { status: 'pass' };
}

/**
 * Drain the ICE action log; classify any errors; emit events. Recipes are
 * NOT run during design phase (errors here are usually UI-state issues, not
 * cloud errors). Just log and continue.
 */
async function drainAndClassify(ctx: RunContext, step: string): Promise<void> {
  const { page, logger } = ctx;
  const log = (await page.evaluate(() => {
    const w = window as any;
    const arr = (w.__ICE_ACTION_LOG__ as any[]) || [];
    w.__ICE_ACTION_LOG__ = [];
    return arr;
  })) as any[];

  for (const ev of log) {
    if (ev.action === 'api_call') {
      logger.emit({ kind: 'api_call', target: ev.target, detail: ev.detail, appSeq: ev.seq });
    } else if (ev.action === 'api_response') {
      logger.emit({
        kind: 'api_response',
        target: ev.target,
        status: Number(ev.detail?.status ?? 0),
        detail: ev.detail,
        appSeq: ev.seq,
        durationMs: ev.duration_ms,
      });
    } else if (ev.action === 'api_error' || ev.category === 'error') {
      const status = Number(ev.detail?.status ?? 0);
      logger.emit({
        kind: 'api_error',
        target: ev.target,
        status,
        detail: ev.detail,
        appSeq: ev.seq,
      });
      const raw = JSON.stringify(ev.detail ?? {});
      const classified = classifyDeployError(raw, {
        phase: step,
        httpStatus: status || undefined,
        gcpProject: ctx.scenario.project.gcp.project,
      });
      logger.emit({ kind: 'error_classified', classified, raw });
    }
  }
}
