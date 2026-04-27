/**
 * cleanup phase — destroy resources or preserve them, per scenario settings.
 *
 * On preserve, write PRESERVED.md with destroy instructions so the user can
 * tear down manually after inspecting.
 */
import type { RunContext, PhaseResult } from '../context';
export declare function runCleanup(ctx: RunContext, overallStatus: 'pass' | 'fail'): Promise<PhaseResult>;
