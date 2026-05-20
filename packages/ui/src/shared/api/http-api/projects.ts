/**
 * `projects` domain — cloud-stored project stubs for the web build.
 *
 * The Electron desktop adapter walks the local filesystem; the web
 * version doesn't, so these methods are no-ops that return empty /
 * null shapes. They exist here only to satisfy the IceAPI shape from
 * the desktop adapter — every UI consumer that calls them on the web
 * branch already has a fallback path.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-3.
 */

import type { IceAPI } from '../api-adapter';

export function createProjectsAdapter(): IceAPI['projects'] {
  return {
    scanDirectory: async () => {
      // Not applicable for web — projects are cloud-stored
      return { files: [], folders: [] };
    },
    createFolder: async () => {
      // Not applicable for web
      return null;
    },
  };
}
