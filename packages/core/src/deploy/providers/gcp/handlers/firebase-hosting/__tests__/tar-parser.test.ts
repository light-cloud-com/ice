/**
 * Tests for `firebase-hosting/tar-parser.ts` (rf-fbh-3). Covers the
 * RISK #3 edge cases: (a) EOF on the first zero-byte block, (b) octal
 * size parsing via `parseInt(_, 8)`, (c) `Math.ceil(size/512)*512`
 * block-padding for empty files (size=0 → 0 advancement), and (d) the
 * `Buffer.from(data)` deep-copy that decouples returned payloads from
 * the source archive buffer.
 *
 * Fixture archives are constructed in-memory with a `makeTarHeader()`
 * helper that fills a 512-byte ustar header (name, size, optional
 * prefix, magic, version, computed checksum) — enough for the parser's
 * read-only path. We do NOT depend on `tar` or any other package; the
 * goal is to pin the parser's behaviour without any external surface.
 */

import { describe, it, expect } from 'vitest';
import { parseTar, type FileEntry } from '../tar-parser';

/**
 * Build a 512-byte ustar header.
 *
 * - `name` is written into bytes 0–100, NUL-padded.
 * - `size` is written into bytes 124–136 as a 0-padded octal string
 *   followed by a NUL terminator (matches the typical ustar layout
 *   produced by GNU `tar`).
 * - `prefix`, when provided, is written into bytes 345–500 — used by
 *   github tarballs when the full path exceeds 100 chars.
 * - typeflag at byte 156 defaults to '0' (regular file). Pass `\0` to
 *   exercise the alternate code path the parser also accepts.
 * - magic 'ustar\0' at 257-263, version '00' at 263-265.
 * - The checksum at 148–156 is computed over the whole header with
 *   the checksum field treated as 8 spaces, then written as a 6-digit
 *   octal followed by NUL + space (the canonical layout).
 */
function makeTarHeader(opts: { name: string; size: number; prefix?: string; typeFlag?: string }): Buffer {
  const header = Buffer.alloc(512);
  // name (0-100)
  header.write(opts.name, 0, 100, 'utf8');
  // mode (100-108) — '0000644\0' is canonical but the parser doesn't
  // read it; leave NULs.
  // uid/gid/mtime — likewise unread; leave NULs.
  // size (124-136) — 11 octal digits + NUL.
  const sizeOctal = opts.size.toString(8).padStart(11, '0');
  header.write(`${sizeOctal}\0`, 124, 12, 'utf8');
  // checksum field placeholder — fill 148-156 with spaces while the
  // checksum is being computed (per ustar spec).
  for (let i = 148; i < 156; i++) header[i] = 0x20;
  // typeflag (156)
  const typeFlag = opts.typeFlag ?? '0';
  header[156] = typeFlag.charCodeAt(0);
  // magic + version (257-263, 263-265)
  header.write('ustar\0', 257, 6, 'utf8');
  header.write('00', 263, 2, 'utf8');
  // prefix (345-500) — optional, used by github when path > 100 chars.
  if (opts.prefix) header.write(opts.prefix, 345, 155, 'utf8');
  // Compute checksum: unsigned sum of all 512 header bytes (with the
  // 8-byte checksum field treated as spaces).
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i] ?? 0;
  // Write 6 octal digits + NUL + space at 148-156.
  const sumOctal = sum.toString(8).padStart(6, '0');
  header.write(`${sumOctal}\0 `, 148, 8, 'utf8');
  return header;
}

/** Pad data up to the next 512-byte block boundary. */
function padToBlock(data: Buffer): Buffer {
  const remainder = data.length % 512;
  if (remainder === 0) return data;
  return Buffer.concat([data, Buffer.alloc(512 - remainder)]);
}

/** Build a full tar entry: header + padded data. */
function makeEntry(opts: { name: string; data: Buffer; prefix?: string; typeFlag?: string }): Buffer {
  const header = makeTarHeader({
    name: opts.name,
    size: opts.data.length,
    prefix: opts.prefix,
    typeFlag: opts.typeFlag,
  });
  return Buffer.concat([header, padToBlock(opts.data)]);
}

/** Trailing 512-byte zero block — parser stops on the first one. */
function eofBlock(): Buffer {
  return Buffer.alloc(512);
}

describe('firebase-hosting/tar-parser', () => {
  describe('parseTar()', () => {
    it('extracts a single 100-byte file (name + data round-trip)', () => {
      const data = Buffer.from('a'.repeat(100), 'utf8');
      const tar = Buffer.concat([makeEntry({ name: 'hello.txt', data }), eofBlock()]);
      const out = parseTar(tar);
      expect(out).toHaveLength(1);
      expect(out[0]?.name).toBe('hello.txt');
      expect(out[0]?.data.equals(data)).toBe(true);
    });

    it('extracts multiple entries of varying sizes in declaration order', () => {
      const a = Buffer.from('one', 'utf8'); // 3 bytes
      const b = Buffer.from('b'.repeat(513), 'utf8'); // 513 bytes
      const c = Buffer.from('c'.repeat(1024), 'utf8'); // 1024 bytes (exact 2 blocks)
      const tar = Buffer.concat([
        makeEntry({ name: 'a.txt', data: a }),
        makeEntry({ name: 'b.txt', data: b }),
        makeEntry({ name: 'c.txt', data: c }),
        eofBlock(),
      ]);
      const out = parseTar(tar);
      expect(out).toHaveLength(3);
      expect(out.map((e) => e.name)).toEqual(['a.txt', 'b.txt', 'c.txt']);
      expect(out[0]?.data.equals(a)).toBe(true);
      expect(out[1]?.data.equals(b)).toBe(true);
      expect(out[2]?.data.equals(c)).toBe(true);
    });

    it('returns an empty Buffer for size=0 entries and skips no data block (RISK #3c)', () => {
      // Crafted ordering: first an empty file, then a non-empty file.
      // If the parser advanced 512 instead of 0 for the empty entry,
      // it would read the second header at the wrong offset and the
      // second file's content would be misaligned.
      const empty = Buffer.alloc(0);
      const next = Buffer.from('next-file', 'utf8');
      const tar = Buffer.concat([
        makeEntry({ name: 'empty.txt', data: empty }),
        makeEntry({ name: 'next.txt', data: next }),
        eofBlock(),
      ]);
      const out = parseTar(tar);
      expect(out).toHaveLength(2);
      expect(out[0]?.name).toBe('empty.txt');
      expect(out[0]?.data.length).toBe(0);
      expect(out[1]?.name).toBe('next.txt');
      expect(out[1]?.data.equals(next)).toBe(true);
    });

    it('stops on the first zero-byte block (RISK #3a — single-block EOF, not GNU two-block)', () => {
      const a = Buffer.from('first', 'utf8');
      const tar = Buffer.concat([
        makeEntry({ name: 'a.txt', data: a }),
        eofBlock(),
        // A second entry past the EOF block — the parser must NOT
        // reach this. A two-block-EOF parser would skip the first
        // zero block looking for a second and could mis-interpret
        // this trailing entry.
        makeEntry({ name: 'should-not-appear.txt', data: Buffer.from('x') }),
      ]);
      const out = parseTar(tar);
      expect(out).toHaveLength(1);
      expect(out[0]?.name).toBe('a.txt');
    });

    it('concatenates ustar prefix + name with `/` (RISK #3 — ustar long-path support)', () => {
      const data = Buffer.from('deep', 'utf8');
      const tar = Buffer.concat([
        makeEntry({
          name: 'index.html',
          data,
          prefix: 'some-repo-main/dist',
        }),
        eofBlock(),
      ]);
      const out = parseTar(tar);
      expect(out).toHaveLength(1);
      expect(out[0]?.name).toBe('some-repo-main/dist/index.html');
    });

    it('handles a name that fills the 100-char field exactly', () => {
      // 100-char filename — the name field is exactly 100 bytes wide,
      // so there is no trailing NUL inside the field. The parser
      // strips trailing NULs but otherwise reads the full 100 chars.
      const longName = 'a'.repeat(100);
      const data = Buffer.from('hi', 'utf8');
      const tar = Buffer.concat([makeEntry({ name: longName, data }), eofBlock()]);
      const out = parseTar(tar);
      expect(out).toHaveLength(1);
      expect(out[0]?.name).toBe(longName);
      expect(out[0]?.name.length).toBe(100);
    });

    it('advances exactly one 512-byte block for a file with 100 bytes (RISK #3c — block alignment)', () => {
      // Math.ceil(100/512) = 1 block → next header starts at offset+512.
      const a = Buffer.from('a'.repeat(100), 'utf8');
      const b = Buffer.from('b-data', 'utf8');
      const tar = Buffer.concat([
        makeEntry({ name: 'a.txt', data: a }),
        makeEntry({ name: 'b.txt', data: b }),
        eofBlock(),
      ]);
      const out = parseTar(tar);
      expect(out).toHaveLength(2);
      expect(out[1]?.name).toBe('b.txt');
      expect(out[1]?.data.equals(b)).toBe(true);
    });

    it('advances exactly two 512-byte blocks for a 600-byte file (RISK #3c — block alignment >512)', () => {
      // Math.ceil(600/512) = 2 blocks → next header at offset+1024.
      const a = Buffer.from('a'.repeat(600), 'utf8');
      const b = Buffer.from('after-600', 'utf8');
      const tar = Buffer.concat([
        makeEntry({ name: 'a.txt', data: a }),
        makeEntry({ name: 'b.txt', data: b }),
        eofBlock(),
      ]);
      const out = parseTar(tar);
      expect(out).toHaveLength(2);
      expect(out[0]?.data.length).toBe(600);
      expect(out[1]?.name).toBe('b.txt');
      expect(out[1]?.data.equals(b)).toBe(true);
    });

    it('parses size as octal — `00000000200` is 128, not 200 (RISK #3b)', () => {
      // Hand-craft a header so the size field literally contains
      // '00000000200\0'. parseInt('00000000200', 8) = 128.
      const header = Buffer.alloc(512);
      header.write('octal-pin.txt', 0, 100, 'utf8');
      header.write('00000000200\0', 124, 12, 'utf8');
      for (let i = 148; i < 156; i++) header[i] = 0x20; // checksum placeholder
      header[156] = '0'.charCodeAt(0); // typeflag
      header.write('ustar\0', 257, 6, 'utf8');
      header.write('00', 263, 2, 'utf8');
      let sum = 0;
      for (let i = 0; i < 512; i++) sum += header[i] ?? 0;
      header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');
      // 128 bytes of payload, then pad to 512.
      const data = Buffer.from('p'.repeat(128), 'utf8');
      const tar = Buffer.concat([header, padToBlock(data), eofBlock()]);
      const out = parseTar(tar);
      expect(out).toHaveLength(1);
      expect(out[0]?.data.length).toBe(128);
      // If size were parsed as decimal it would be 200, the buffer would
      // then be 200 bytes long including trailing zero-padding bytes.
      expect(out[0]?.data.length).not.toBe(200);
    });

    it('returns a deep copy of file data — mutating the source tar after parseTar does not corrupt entries (RISK #3d)', () => {
      const original = Buffer.from('hello', 'utf8');
      const tar = Buffer.concat([makeEntry({ name: 'a.txt', data: original }), eofBlock()]);
      const out = parseTar(tar);
      const beforeMutation = Buffer.from(out[0]!.data); // snapshot for compare

      // Overwrite the entire tar buffer with zeros — this would mutate
      // the parser's data view if it had returned a `subarray` slice
      // of the source rather than a `Buffer.from(...)` copy.
      tar.fill(0);

      expect(out[0]?.data.equals(beforeMutation)).toBe(true);
      expect(out[0]?.data.toString('utf8')).toBe('hello');
    });

    it('skips non-regular-file entries (typeflag !== "0" / NUL)', () => {
      // typeflag '5' is a directory in ustar — the parser should skip
      // the data push but still advance the offset for any data block.
      const dirData = Buffer.alloc(0); // dirs have size=0 in practice
      const fileData = Buffer.from('real', 'utf8');
      const tar = Buffer.concat([
        makeEntry({ name: 'subdir/', data: dirData, typeFlag: '5' }),
        makeEntry({ name: 'subdir/file.txt', data: fileData }),
        eofBlock(),
      ]);
      const out = parseTar(tar);
      expect(out).toHaveLength(1);
      expect(out[0]?.name).toBe('subdir/file.txt');
      expect(out[0]?.data.equals(fileData)).toBe(true);
    });

    it('accepts NUL typeflag as a regular-file equivalent (matches ustar spec)', () => {
      // Some older archivers leave typeflag = NUL instead of '0'. The
      // parser treats both as regular files.
      const data = Buffer.from('nul-typeflag', 'utf8');
      const tar = Buffer.concat([makeEntry({ name: 'a.txt', data, typeFlag: '\0' }), eofBlock()]);
      const out = parseTar(tar);
      expect(out).toHaveLength(1);
      expect(out[0]?.name).toBe('a.txt');
      expect(out[0]?.data.equals(data)).toBe(true);
    });

    it('returns an empty array for an empty buffer', () => {
      expect(parseTar(Buffer.alloc(0))).toEqual([]);
    });

    it('returns an empty array for a buffer that starts with a zero block (immediate EOF)', () => {
      expect(parseTar(eofBlock())).toEqual([]);
    });

    it('stops cleanly when the buffer ends mid-header (offset + 512 > buf.length)', () => {
      // 256 bytes of partial header — loop guard offset+512 <= buf.length
      // bails before reading. Must not throw.
      const partial = Buffer.alloc(256);
      partial.write('truncated.txt', 0, 100, 'utf8');
      expect(parseTar(partial)).toEqual([]);
    });

    it('handles an empty size field (NUL-only) by treating size as 0', () => {
      // A header where the size field is all NULs. After the NUL+space
      // strip the resulting string is empty, so the parser falls back
      // to size=0.
      const header = Buffer.alloc(512);
      header.write('zero-size.txt', 0, 100, 'utf8');
      // size field stays all NULs at 124-136.
      for (let i = 148; i < 156; i++) header[i] = 0x20;
      header[156] = '0'.charCodeAt(0);
      header.write('ustar\0', 257, 6, 'utf8');
      header.write('00', 263, 2, 'utf8');
      let sum = 0;
      for (let i = 0; i < 512; i++) sum += header[i] ?? 0;
      header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');

      const tar = Buffer.concat([header, eofBlock()]);
      const out = parseTar(tar);
      expect(out).toHaveLength(1);
      expect(out[0]?.name).toBe('zero-size.txt');
      expect(out[0]?.data.length).toBe(0);
    });
  });

  describe('FileEntry interface', () => {
    it('has the documented {hostingPath, bytes} shape (compile-time pin)', () => {
      // Compile-only: ensure the type is exported and shaped correctly.
      // The interface is consumed by github-downloader and version-publisher
      // via the same import path.
      const e: FileEntry = {
        hostingPath: '/index.html',
        bytes: Buffer.from('<!doctype html>', 'utf8'),
      };
      expect(e.hostingPath).toBe('/index.html');
      expect(Buffer.isBuffer(e.bytes)).toBe(true);
    });
  });
});
