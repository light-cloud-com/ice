/**
 * Recipe registry — runs an applicable, allow-listed recipe against a
 * classified error. Returns `{ fixed: true }` if the runner should retry
 * the failed step; `{ fixed: false }` to bail out.
 */
import type { ClassifiedError, ErrorCategory } from '../../../utils/error-classifier';
import type { RunContext } from '../context';
export type RecipeStatus = 'fixed' | 'needs-human' | 'abandoned';
export interface RecipeResult {
    status: RecipeStatus;
    notes: string[];
}
export interface Recipe {
    name: string;
    category: ErrorCategory | 'billing_disabled';
    match: (err: ClassifiedError) => boolean;
    fix: (ctx: RunContext, err: ClassifiedError) => Promise<RecipeResult>;
    maxAttempts: number;
}
export declare const ALL_RECIPES: Recipe[];
export declare function runRecipes(ctx: RunContext, classified: ClassifiedError): Promise<{
    fixed: boolean;
}>;
