/**
 * Recipe: GCP API not enabled.
 *
 * Strategy: extract the API name from the error message, run
 * `gcloud services enable <api>`, wait 30s for propagation, return 'fixed'.
 * The deploy phase will retry plan/apply.
 */

import { execSync } from 'child_process';
import type { Recipe, RecipeResult } from './index';

export const apiNotEnabledRecipe: Recipe = {
  name: 'api-not-enabled',
  category: 'api_not_enabled',
  maxAttempts: 2,
  match: (err) => err.category === 'api_not_enabled',
  fix: async (ctx, err): Promise<RecipeResult> => {
    const notes: string[] = [];
    const apiMatch = err.message.match(/(?:googleapis\.com\/)?([a-z][a-z0-9-]*\.googleapis\.com)/i);
    const api = apiMatch?.[1];
    if (!api) {
      return { status: 'abandoned', notes: ['Could not extract API name from error'] };
    }
    notes.push(`extracted api=${api}`);

    const project = ctx.scenario.project.gcp.project;
    try {
      execSync(`gcloud services enable ${api} --project=${project}`, {
        encoding: 'utf-8',
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      notes.push(`gcloud services enable ${api} ok`);
    } catch (e: any) {
      const stderr = e?.stderr?.toString?.() || e?.message || String(e);
      notes.push(`gcloud services enable failed: ${stderr.slice(0, 200)}`);
      return { status: 'needs-human', notes };
    }

    notes.push('waiting 30s for API enablement to propagate');
    await new Promise((r) => setTimeout(r, 30_000));

    return { status: 'fixed', notes };
  },
};
