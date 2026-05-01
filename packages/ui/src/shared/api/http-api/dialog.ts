/**
 * `dialog` domain — file-system-style prompts for the web build.
 *
 * The web build can't reach the user's local filesystem the way the
 * Electron desktop adapter can. These methods open browser file
 * pickers (`<input type="file">`) for `openFile` / `importTerraform`,
 * and stub out `saveFile` / `selectDirectory` since the web edition
 * persists everything to the cloud.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-3.
 */

import type { IceAPI } from '../api-adapter';

export function createDialogAdapter(): IceAPI['dialog'] {
  return {
    openFile: async () => {
      return new Promise<string | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ice,.json';
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsText(file);
          } else {
            resolve(null);
          }
        };
        input.click();
      });
    },
    saveFile: async () => {
      // Web version saves to cloud — use download for local export
      return null;
    },
    importTerraform: async () => {
      return new Promise<any>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.tf,.hcl';
        input.multiple = true;
        input.onchange = () => {
          resolve(input.files);
        };
        input.click();
      });
    },
    selectDirectory: async () => {
      // Not applicable for web — projects are cloud-stored
      return null;
    },
  };
}
