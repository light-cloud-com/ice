/**
 * Tests for `customization/scanner.ts` (rf-cload-3).
 *
 * Behaviour pinned (preserved from `scan_directory` private method):
 *  - Non-existent directory -> empty array (no throw).
 *  - Filters by lowercased extension match against `extensions` list.
 *  - Skips entries that are not regular files (subdirectories,
 *    symlinks-to-dirs).
 *  - Each file row carries `name`, `path`, `size`, `modified` (mtime).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scan_directory } from '../customization/scanner';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-cload-scan-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('scan_directory', () => {
  it('returns empty array when the directory does not exist', () => {
    expect(scan_directory(path.join(tmp, 'nope'), ['.json'])).toEqual([]);
  });

  it('returns rows for matching extensions', () => {
    fs.writeFileSync(path.join(tmp, 'a.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'b.yaml'), 'x: 1');
    fs.writeFileSync(path.join(tmp, 'c.txt'), 'plain');
    const rows = scan_directory(tmp, ['.json']).map((r) => r.name).sort();
    expect(rows).toEqual(['a.json']);
  });

  it('matches multiple extensions', () => {
    fs.writeFileSync(path.join(tmp, 'a.yaml'), '');
    fs.writeFileSync(path.join(tmp, 'b.yml'), '');
    fs.writeFileSync(path.join(tmp, 'c.json'), '');
    const names = scan_directory(tmp, ['.yaml', '.yml']).map((r) => r.name).sort();
    expect(names).toEqual(['a.yaml', 'b.yml']);
  });

  it('filters by lowercased extension', () => {
    fs.writeFileSync(path.join(tmp, 'a.JSON'), '{}');
    expect(scan_directory(tmp, ['.json']).map((r) => r.name)).toEqual(['a.JSON']);
  });

  it('skips subdirectories with a matching extension-like name', () => {
    fs.mkdirSync(path.join(tmp, 'directory.json'));
    expect(scan_directory(tmp, ['.json'])).toEqual([]);
  });

  it('returns size and modified for each row', () => {
    const file = path.join(tmp, 'a.json');
    fs.writeFileSync(file, 'hello');
    const rows = scan_directory(tmp, ['.json']);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.size).toBeGreaterThan(0);
    expect(rows[0]?.modified).toBeInstanceOf(Date);
    expect(rows[0]?.path).toBe(file);
  });
});
