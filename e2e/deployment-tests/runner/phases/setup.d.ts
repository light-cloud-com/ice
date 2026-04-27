/**
 * setup phase — make sure GCP + GitHub are connected and the user lands on
 * a fresh canvas.
 *
 * Reuses `selectTemplate` from template-deploy fixture for the "empty"
 * starting point. If a non-default `baseTemplate` is set on the scenario,
 * uses that template name as-is.
 */
import type { RunContext, PhaseResult } from '../context';
export declare function runSetup(ctx: RunContext): Promise<PhaseResult>;
