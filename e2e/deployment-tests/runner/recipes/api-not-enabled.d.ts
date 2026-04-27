/**
 * Recipe: GCP API not enabled.
 *
 * Strategy: extract the API name from the error message, run
 * `gcloud services enable <api>`, wait 30s for propagation, return 'fixed'.
 * The deploy phase will retry plan/apply.
 */
import type { Recipe } from './index';
export declare const apiNotEnabledRecipe: Recipe;
