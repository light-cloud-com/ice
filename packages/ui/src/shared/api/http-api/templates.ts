/**
 * `templates` domain — template loading for the web build.
 *
 * In the web edition templates are expanded client-side via
 * `config/templates`; Redux state is the source of truth. The
 * `loadToGraph` method is a no-op that returns success — it exists
 * only to satisfy the IceAPI shape from the desktop adapter, where it
 * does load templates over IPC.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-3.
 */

import type { IceAPI } from '../api-adapter';

export function createTemplatesAdapter(): IceAPI['templates'] {
  return {
    loadToGraph: async (_data) => {
      // In web version, templates are expanded client-side via config/templates
      // No backend call needed — Redux state is the source of truth
      return { success: true };
    },
  };
}
