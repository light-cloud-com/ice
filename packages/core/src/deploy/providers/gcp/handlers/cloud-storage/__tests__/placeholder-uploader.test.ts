/**
 * Tests for `cloud-storage/placeholder-uploader.ts` (rf-cstor-5).
 *
 * RISK #8 — placeholder skip-if-exists guards are INDEPENDENT. A
 * throw on the `index.html` exists() check must not block the 404
 * check, and vice versa. The function uses `.catch(() => [false])`
 * on each call separately to enforce this.
 */

import { describe, it, expect, vi } from 'vitest';
import { uploadPlaceholders } from '../placeholder-uploader';
import type { GCPHandlerContext } from '../../../types';

function makeCtx(): { ctx: GCPHandlerContext; logs: string[] } {
  const logs: string[] = [];
  const ctx = {
    clients: { get: () => null } as any,
    on_log: (m: string) => logs.push(m),
  } as unknown as GCPHandlerContext;
  return { ctx, logs };
}

interface FileMock {
  exists: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  acl: { add: ReturnType<typeof vi.fn> };
}

function makeFile(overrides: Partial<FileMock> = {}): FileMock {
  return {
    exists: overrides.exists || vi.fn().mockResolvedValue([false]),
    save: overrides.save || vi.fn().mockResolvedValue(undefined),
    acl: overrides.acl || { add: vi.fn().mockResolvedValue(undefined) },
  };
}

interface BucketMock {
  files: Map<string, FileMock>;
  bucket: {
    file: ReturnType<typeof vi.fn>;
    getFiles: ReturnType<typeof vi.fn>;
  };
}

function makeBucket(opts: {
  indexExists?: boolean | (() => Promise<any>);
  notFoundExists?: boolean | (() => Promise<any>);
  saveImpl?: () => Promise<any>;
  existingFiles?: FileMock[];
  getFilesRejects?: boolean;
}): BucketMock {
  const files = new Map<string, FileMock>();
  const indexFile = makeFile({
    exists:
      typeof opts.indexExists === 'function'
        ? vi.fn().mockImplementation(opts.indexExists)
        : vi.fn().mockResolvedValue([opts.indexExists ?? false]),
    save: opts.saveImpl ? vi.fn().mockImplementation(opts.saveImpl) : vi.fn().mockResolvedValue(undefined),
  });
  const notFoundFile = makeFile({
    exists:
      typeof opts.notFoundExists === 'function'
        ? vi.fn().mockImplementation(opts.notFoundExists)
        : vi.fn().mockResolvedValue([opts.notFoundExists ?? false]),
    save: opts.saveImpl ? vi.fn().mockImplementation(opts.saveImpl) : vi.fn().mockResolvedValue(undefined),
  });
  files.set('index.html', indexFile);
  files.set('404.html', notFoundFile);
  const bucket = {
    file: vi.fn((name: string) => {
      if (!files.has(name)) files.set(name, makeFile());
      return files.get(name);
    }),
    getFiles: opts.getFilesRejects
      ? vi.fn().mockRejectedValue(new Error('list rejected'))
      : vi.fn().mockResolvedValue([opts.existingFiles || []]),
  };
  return { files, bucket };
}

describe('cloud-storage/placeholder-uploader', () => {
  describe('skip-if-exists', () => {
    it('uploads both placeholders on a fresh bucket', async () => {
      const { bucket, files } = makeBucket({});
      const { ctx } = makeCtx();
      const warnings = await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(warnings).toEqual([]);
      expect(files.get('index.html')!.save).toHaveBeenCalledTimes(1);
      expect(files.get('404.html')!.save).toHaveBeenCalledTimes(1);
    });

    it('skips upload when index.html exists', async () => {
      const { bucket, files } = makeBucket({ indexExists: true });
      const { ctx } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(files.get('index.html')!.save).not.toHaveBeenCalled();
      expect(files.get('404.html')!.save).toHaveBeenCalledTimes(1);
    });

    it('skips upload when 404.html exists', async () => {
      const { bucket, files } = makeBucket({ notFoundExists: true });
      const { ctx } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(files.get('index.html')!.save).toHaveBeenCalledTimes(1);
      expect(files.get('404.html')!.save).not.toHaveBeenCalled();
    });

    it('skips both when both exist', async () => {
      const { bucket, files } = makeBucket({ indexExists: true, notFoundExists: true });
      const { ctx } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(files.get('index.html')!.save).not.toHaveBeenCalled();
      expect(files.get('404.html')!.save).not.toHaveBeenCalled();
    });
  });

  describe('RISK #8: independent skip guards', () => {
    it('still checks 404.html when index.html exists() throws', async () => {
      const { bucket, files } = makeBucket({
        indexExists: () => Promise.reject(new Error('list-objects rate limited')),
      });
      const { ctx } = makeCtx();
      const warnings = await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      // index.html exists() rejected → .catch(() => [false]) → upload runs.
      expect(files.get('index.html')!.save).toHaveBeenCalledTimes(1);
      // 404.html exists() resolved with default false → upload runs.
      expect(files.get('404.html')!.save).toHaveBeenCalledTimes(1);
      expect(warnings).toEqual([]);
    });

    it('still uploads index.html when 404.html exists() throws', async () => {
      const { bucket, files } = makeBucket({
        notFoundExists: () => Promise.reject(new Error('flaky')),
      });
      const { ctx } = makeCtx();
      const warnings = await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(files.get('index.html')!.save).toHaveBeenCalledTimes(1);
      expect(files.get('404.html')!.save).toHaveBeenCalledTimes(1);
      expect(warnings).toEqual([]);
    });
  });

  describe('predefinedAcl flag', () => {
    it('passes "publicRead" when publicAccess && !ublaForcedOn', async () => {
      const { bucket, files } = makeBucket({});
      const { ctx } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(files.get('index.html')!.save.mock.calls[0][1].predefinedAcl).toBe('publicRead');
      expect(files.get('404.html')!.save.mock.calls[0][1].predefinedAcl).toBe('publicRead');
    });

    it('passes undefined when ublaForcedOn=true', async () => {
      const { bucket, files } = makeBucket({});
      const { ctx } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: true,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(files.get('index.html')!.save.mock.calls[0][1].predefinedAcl).toBeUndefined();
    });

    it('passes undefined when publicAccess=false', async () => {
      const { bucket, files } = makeBucket({});
      const { ctx } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: false,
        ublaForcedOn: false,
        publicGrantStrategy: 'none',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(files.get('index.html')!.save.mock.calls[0][1].predefinedAcl).toBeUndefined();
    });

    it('uploads with content-type and resumable: false', async () => {
      const { bucket, files } = makeBucket({});
      const { ctx } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      const saveOpts = files.get('index.html')!.save.mock.calls[0][1];
      expect(saveOpts.contentType).toBe('text/html; charset=utf-8');
      expect(saveOpts.resumable).toBe(false);
    });
  });

  describe('ACL backfill on adopted bucket', () => {
    it('runs backfill when bucketAlreadyExisted && publicAccess && publicGrantStrategy=legacy-acl', async () => {
      const file1 = { acl: { add: vi.fn().mockResolvedValue(undefined) } };
      const file2 = { acl: { add: vi.fn().mockResolvedValue(undefined) } };
      const { bucket } = makeBucket({ existingFiles: [file1 as any, file2 as any] });
      const { ctx, logs } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'legacy-acl',
        bucketAlreadyExisted: true,
        ctx,
      });
      expect(file1.acl.add).toHaveBeenCalledWith({ entity: 'allUsers', role: 'READER' });
      expect(file2.acl.add).toHaveBeenCalledWith({ entity: 'allUsers', role: 'READER' });
      expect(logs.some((l) => l.includes('Backfilled allUsers:READER ACL on 2 existing'))).toBe(true);
    });

    it('skips backfill when bucketAlreadyExisted=false', async () => {
      const { bucket } = makeBucket({});
      const { ctx } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'legacy-acl',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(bucket.getFiles).not.toHaveBeenCalled();
    });

    it('skips backfill when publicAccess=false', async () => {
      const { bucket } = makeBucket({});
      const { ctx } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: false,
        ublaForcedOn: false,
        publicGrantStrategy: 'none',
        bucketAlreadyExisted: true,
        ctx,
      });
      expect(bucket.getFiles).not.toHaveBeenCalled();
    });

    it('skips backfill when publicGrantStrategy=iam (IAM already covers all objects)', async () => {
      const { bucket } = makeBucket({});
      const { ctx } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: true,
        ctx,
      });
      expect(bucket.getFiles).not.toHaveBeenCalled();
    });

    it('logs but does not warn when getFiles rejects', async () => {
      const { bucket } = makeBucket({ getFilesRejects: true });
      const { ctx, logs } = makeCtx();
      const warnings = await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'legacy-acl',
        bucketAlreadyExisted: true,
        ctx,
      });
      expect(warnings).toEqual([]);
      expect(logs.some((l) => l.includes('Could not backfill ACLs'))).toBe(true);
    });

    it('continues backfill loop when an individual acl.add() rejects (best-effort)', async () => {
      const file1 = { acl: { add: vi.fn().mockRejectedValue(new Error('forbidden')) } };
      const file2 = { acl: { add: vi.fn().mockResolvedValue(undefined) } };
      const { bucket } = makeBucket({ existingFiles: [file1 as any, file2 as any] });
      const { ctx, logs } = makeCtx();
      await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'legacy-acl',
        bucketAlreadyExisted: true,
        ctx,
      });
      expect(file1.acl.add).toHaveBeenCalled();
      expect(file2.acl.add).toHaveBeenCalled();
      // Backfill log emitted because the per-file failures are swallowed.
      expect(logs.some((l) => l.includes('Backfilled'))).toBe(true);
    });
  });

  describe('outer error handling (warnings push)', () => {
    it('pushes a warning when index.html save() rejects', async () => {
      const { bucket } = makeBucket({
        saveImpl: () => Promise.reject(new Error('disk full')),
      });
      const { ctx } = makeCtx();
      const warnings = await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('Could not upload placeholder index.html');
      expect(warnings[0]).toContain('disk full');
    });

    it('coerces non-Error throws to strings in the outer catch', async () => {
      const { bucket } = makeBucket({
        saveImpl: () => Promise.reject('plain string'),
      });
      const { ctx } = makeCtx();
      const warnings = await uploadPlaceholders({
        bucket,
        name: 'b',
        publicAccess: true,
        ublaForcedOn: false,
        publicGrantStrategy: 'iam',
        bucketAlreadyExisted: false,
        ctx,
      });
      expect(warnings[0]).toContain('plain string');
    });
  });
});
