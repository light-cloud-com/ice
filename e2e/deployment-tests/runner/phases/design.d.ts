/**
 * design phase — drag each block onto the canvas, set its properties, then
 * connect them per the scenario. After every block + connection, drain the
 * ICE action log for warnings/errors, classify, and try recipes.
 */
import type { RunContext, PhaseResult } from '../context';
export declare function runDesign(ctx: RunContext): Promise<PhaseResult>;
