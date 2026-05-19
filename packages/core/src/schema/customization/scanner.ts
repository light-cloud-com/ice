/**
 * Directory scanner for customization files.
 *
 * Extracted from `CustomizationLoader.scan_directory` (rf-cload-3).
 * `CustomizationFile` shape lives here so the scanner is the canonical
 * source of the type. The orchestrator file `customization-loader.ts`
 * re-exports it so external consumers' import paths are unchanged.
 *
 * Behaviour preserved verbatim:
 *  - Returns `[]` when the directory does not exist.
 *  - Iterates `readdirSync` entries, lowercases each `path.extname`,
 *    keeps only those whose lowercased extension is in `extensions`.
 *  - Each entry is statSync'd; only `isFile()` rows are returned.
 *  - Errors during read/stat are silently swallowed (returns the rows
 *    accumulated up to the failure).
 */
import * as fs from 'fs';
import * as path from 'path';

export interface CustomizationFile {
  name: string;
  path: string;
  size: number;
  modified: Date;
}

export function scan_directory(dir: string, extensions: string[]): CustomizationFile[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: CustomizationFile[] = [];

  try {
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (!extensions.includes(ext)) {
        continue;
      }

      const file_path = path.join(dir, entry);
      const stats = fs.statSync(file_path);

      if (stats.isFile()) {
        files.push({
          name: entry,
          path: file_path,
          size: stats.size,
          modified: stats.mtime,
        });
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}
