/**
 * verify phase — post-apply, query GCP via gcloud (existing gcp-verify.ts)
 * for each expected resource. Match by exact name, name-contains, or
 * domain. If the apply result includes deployed resources, use those names
 * to seed the lookup.
 */

import type { RunContext, PhaseResult } from '../context';
import { verifyGCPResource, type VerifyResult } from '../../../utils/gcp-verify';
import type { ExpectedResource } from '../schema';

interface DeployedResource {
  name: string;
  type: string;
  provider_id?: string;
  success?: boolean;
  error?: string;
}

export async function runVerify(ctx: RunContext): Promise<PhaseResult> {
  const { logger, scenario, applyResult } = ctx;

  const project = scenario.project.gcp.project;
  const region = scenario.project.gcp.region;

  const deployed = extractDeployedResources(applyResult?.result);
  logger.note(`Apply reported ${deployed.length} deployed resource(s)`);
  if (deployed.length > 0) {
    const summary = deployed
      .map((r) => `  - ${r.type} ${r.name}${r.success === false ? ' [FAILED]' : ''}${r.error ? ` (${r.error.slice(0, 120)})` : ''}`)
      .join('\n');
    logger.emit({ kind: 'note', level: 'info', message: `Deployed resources:\n${summary}` });
  } else {
    // Best-effort diagnostic: dump the keys of applyResult.result so we can
    // tell whether the response shape changed underneath us.
    const keys =
      applyResult?.result && typeof applyResult.result === 'object'
        ? Object.keys(applyResult.result as Record<string, unknown>).join(', ')
        : '(none)';
    logger.note(`apply.result keys: [${keys}]`, 'warn');
  }

  // Empty expect.resources → "verify means apply succeeded AND every
  // deployed resource succeeded individually". The apply API can return
  // 200 with partial failures (e.g. Cloud SQL fails but Storage succeeds);
  // those are reported per-resource via the success: false flag.
  if (scenario.expect.resources.length === 0) {
    if (!applyResult?.success) {
      return { status: 'fail', error: 'apply did not succeed and no expect.resources to fall back on' };
    }
    const failed = deployed.filter((d) => d.success === false);
    if (failed.length > 0) {
      const detail = failed
        .map((d) => `${d.type} ${d.name}${d.error ? ` — ${d.error.slice(0, 200)}` : ''}`)
        .join('; ');
      return {
        status: 'fail',
        error: `${failed.length}/${deployed.length} resource(s) failed: ${detail}`,
      };
    }
    logger.note('No expect.resources; apply succeeded with all resources OK → verify pass');
    return { status: 'pass' };
  }

  let allPass = true;
  for (const expected of scenario.expect.resources) {
    logger.setStep(`verify:${expected.kind}`);
    const match = findMatch(deployed, expected);

    logger.emit({
      kind: 'gcloud_check',
      resourceKind: expected.kind,
      params: {
        nameContains: expected.nameContains,
        name: expected.name ?? match?.name,
        domain: expected.domain,
      },
    });

    if (!match && !expected.name) {
      logger.emit({
        kind: 'gcloud_result',
        resourceKind: expected.kind,
        exists: false,
        error: `No deployed resource of kind ${expected.kind} matched name=${expected.name ?? expected.nameContains ?? '(any)'}`,
      });
      allPass = false;
      continue;
    }

    const targetName = expected.name ?? match!.name;
    const result: VerifyResult = verifyGCPResource(project, region, {
      name: targetName,
      type: expected.kind,
    });

    logger.emit({
      kind: 'gcloud_result',
      resourceKind: expected.kind,
      exists: result.exists,
      resource: result.resource ?? undefined,
      error: result.error ?? undefined,
    });

    if (!result.exists) allPass = false;
  }

  return { status: allPass ? 'pass' : 'fail', error: allPass ? undefined : 'one or more expected resources missing' };
}

function extractDeployedResources(applyData: unknown): DeployedResource[] {
  if (!applyData || typeof applyData !== 'object') return [];
  const data = applyData as Record<string, unknown>;
  // The deploy/apply API response is wrapped:
  //   { success, deploymentId, duration_ms, error, result: { resources: [...] } }
  // Look at both shapes for resilience.
  const inner = data.result && typeof data.result === 'object' ? (data.result as Record<string, unknown>) : data;
  const arr = Array.isArray(inner.resources) ? (inner.resources as unknown[]) : [];
  const out: DeployedResource[] = [];
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name : undefined;
    const type = typeof r.type === 'string' ? r.type : undefined;
    if (!name || !type) continue;
    out.push({
      name,
      type,
      provider_id: typeof r.provider_id === 'string' ? r.provider_id : undefined,
      success: typeof r.success === 'boolean' ? r.success : undefined,
      error: typeof r.error === 'string' ? r.error : undefined,
    });
  }
  return out;
}

function findMatch(deployed: DeployedResource[], expected: ExpectedResource): DeployedResource | null {
  const sameKind = deployed.filter((d) => d.type === expected.kind);
  if (sameKind.length === 0) return null;
  if (expected.name) {
    return sameKind.find((d) => d.name === expected.name) ?? null;
  }
  if (expected.nameContains) {
    return sameKind.find((d) => d.name.includes(expected.nameContains!)) ?? null;
  }
  // No matcher: any of this kind.
  return sameKind[0];
}
