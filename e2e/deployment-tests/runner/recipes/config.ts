/**
 * Recipe: invalid config.
 *
 * Best-effort: re-apply all properties from the scenario spec to every
 * block. Useful when a transient UI race lost a property write. Returns
 * 'fixed' so the deploy phase retries plan; if the same error recurs the
 * runner will give up at maxAttempts.
 */

import type { Recipe, RecipeResult } from './index';

export const configRecipe: Recipe = {
  name: 'config',
  category: 'config',
  maxAttempts: 1,
  match: (err) => err.category === 'config',
  fix: async (ctx): Promise<RecipeResult> => {
    const { scenario, canvas, props, page, logger, nodeIdByAlias } = ctx;
    const notes: string[] = [];
    for (const block of scenario.blocks) {
      if (Object.keys(block.properties).length === 0) continue;
      const nodeId = nodeIdByAlias.get(block.id);
      if (!nodeId) {
        notes.push(`no live node for alias ${block.id}; skipping`);
        continue;
      }
      try {
        await canvas.selectBlock(nodeId);
        await page.waitForTimeout(300);
        await props.applyProperties(block.properties);
        notes.push(`re-applied props for ${block.id}`);
      } catch (err) {
        notes.push(`re-apply failed for ${block.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    logger.note('config recipe: properties re-applied');
    // Close the deploy panel so the next plan attempt re-opens it cleanly.
    return { status: 'fixed', notes };
  },
};
