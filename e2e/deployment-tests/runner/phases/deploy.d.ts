/**
 * deploy phase — open deploy panel, configure, plan, apply.
 *
 * On plan failure: classify error → run permitted recipes (per scenario) →
 * retry plan up to 2 times. On apply: stream #ice-deploy-log into
 * events.jsonl as deploy_log_tail events.
 */
import type { RunContext, PhaseResult } from '../context';
export declare function runDeploy(ctx: RunContext): Promise<PhaseResult>;
