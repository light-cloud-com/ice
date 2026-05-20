/**
 * Minimal in-memory tar parser for Firebase Hosting GitHub-tarball
 * uploads. Extracted from `firebase-hosting.ts` so the github-downloader
 * (and any future module that needs to walk a ustar archive) can share
 * the same self-contained parser. No imports beyond Node's `Buffer`.
 *
 * `FileEntry` is the downstream content shape used by the github
 * downloader and version publisher; it stays here so the entire tar
 * pipeline lives behind one import path.
 */

export interface FileEntry {
  /** Hosting path beginning with `/`. */
  hostingPath: string;
  /** Raw (un-gzipped) bytes. */
  bytes: Buffer;
}

/**
 * Minimal in-memory tar parser. Tar is a simple format: 512-byte
 * header blocks followed by file data padded to 512 bytes. We only
 * care about regular file entries (typeflag '0' or NUL) — directories
 * and symlinks are skipped.
 *
 * GNU/PAX long-name extensions are ignored: github tarballs use ustar
 * with name+prefix, which fits all real-world repo paths within 255
 * chars. If a future repo hits the limit we can add long-name handling.
 */
export function parseTar(buf: Buffer): Array<{ name: string; data: Buffer }> {
  const out: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    // EOF: two consecutive zero blocks. Stop on the first.
    if (header[0] === 0) break;

    const nameField = header.subarray(0, 100).toString('utf8').replace(/\0+$/, '');
    const sizeField = header
      .subarray(124, 136)
      .toString('utf8')
      .replace(/\0+| +$/g, '');
    const typeFlag = String.fromCharCode(header[156] || 0);
    const prefixField = header.subarray(345, 500).toString('utf8').replace(/\0+$/, '');

    const size = sizeField ? parseInt(sizeField, 8) : 0;
    const fullName = prefixField ? `${prefixField}/${nameField}` : nameField;

    offset += 512;

    if (typeFlag === '0' || typeFlag === '\0') {
      // Regular file
      const data = buf.subarray(offset, offset + size);
      out.push({ name: fullName, data: Buffer.from(data) });
    }
    // Skip data block, padded up to 512 bytes
    offset += Math.ceil(size / 512) * 512;
  }
  return out;
}
