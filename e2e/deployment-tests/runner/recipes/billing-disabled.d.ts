/**
 * Recipe: GCP billing disabled. Cannot auto-fix; emit wait_for_human and
 * return 'needs-human'. The runner treats this as a non-fix so the scenario
 * fails cleanly with diagnostic logs.
 */
import type { Recipe } from './index';
export declare const billingDisabledRecipe: Recipe;
