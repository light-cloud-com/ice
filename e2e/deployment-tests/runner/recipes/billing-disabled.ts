/**
 * Recipe: GCP billing disabled. Cannot auto-fix; emit wait_for_human and
 * return 'needs-human'. The runner treats this as a non-fix so the scenario
 * fails cleanly with diagnostic logs.
 */

import type { Recipe, RecipeResult } from './index';

export const billingDisabledRecipe: Recipe = {
  name: 'billing-disabled',
  category: 'billing_disabled',
  maxAttempts: 1,
  match: (err) =>
    err.category === 'permission' &&
    /billing|BILLING_DISABLED|billing.*not.*enabled/i.test(err.message),
  fix: async (ctx): Promise<RecipeResult> => {
    const { logger, scenario } = ctx;
    const url = `https://console.cloud.google.com/billing/linkedaccount?project=${scenario.project.gcp.project}`;
    logger.emit({
      kind: 'wait_for_human',
      reason: 'GCP billing not enabled; cannot deploy',
      resumeUrl: url,
    });
    return { status: 'needs-human', notes: [`billing console: ${url}`] };
  },
};
