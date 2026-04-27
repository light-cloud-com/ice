/**
 * verify phase — post-apply, query GCP via gcloud (existing gcp-verify.ts)
 * for each expected resource. Match by exact name, name-contains, or
 * domain. If the apply result includes deployed resources, use those names
 * to seed the lookup.
 */
import type { RunContext, PhaseResult } from '../context';
export declare function runVerify(ctx: RunContext): Promise<PhaseResult>;
