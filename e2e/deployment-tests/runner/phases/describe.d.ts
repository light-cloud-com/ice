/**
 * describe phase — write the human-readable scenario description to the
 * run dir and emit a structured note so events.jsonl carries the spec.
 */
import type { RunContext, PhaseResult } from '../context';
export declare function runDescribe(ctx: RunContext): Promise<PhaseResult>;
