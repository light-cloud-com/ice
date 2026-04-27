/**
 * Recipe: transient network error. Backoff + retry.
 */
const BACKOFF_MS = [5_000, 15_000, 45_000];
export const networkRecipe = {
    name: 'network',
    category: 'network',
    maxAttempts: 3,
    match: (err) => err.category === 'network',
    fix: async (_ctx, _err) => {
        const notes = [];
        // Use a per-recipe counter via closure-state is overkill; just sleep
        // a fixed long-ish window per call. The runner's maxAttempts caps it.
        const wait = BACKOFF_MS[0];
        notes.push(`backoff ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        return { status: 'fixed', notes };
    },
};
