/**
 * Unit tests for `services/ai/src/services/ai/post-processing.ts`
 * — the audit enrichment helper extracted in rf-aisvc-5 from
 * `ai.service.ts`.
 *
 * The module pulls in three sibling services (audit, validate, dry-
 * run); per `rf-lstream-split-stream-lifecycle-by-dependency-surface`
 * those are mocked from this test file alone, leaving the
 * response-parsing tests untouched by their dependency surface.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuditEntry: vi.fn(),
  finalizeAuditEntry: vi.fn(),
  writeAuditEntry: vi.fn(),
  validateCanvas: vi.fn(),
  dryRunDeploy: vi.fn(),
}));

vi.mock('../../ai-audit.service', () => ({
  createAuditEntry: mocks.createAuditEntry,
  finalizeAuditEntry: mocks.finalizeAuditEntry,
  writeAuditEntry: mocks.writeAuditEntry,
}));

vi.mock('../../canvas-validation.service', () => ({
  validateCanvas: mocks.validateCanvas,
}));

vi.mock('../../deploy-dryrun.service', () => ({
  dryRunDeploy: mocks.dryRunDeploy,
}));

import { runPostProcessing } from '../post-processing';
import type { AiResponse, SerializedCanvas } from '@ice/types';

const sentinelAudit = { id: 'audit-1' } as any;
const baseCanvas: SerializedCanvas = {
  nodes: [{ id: 'n1' }] as any,
  edges: [{ source: 'a', target: 'b' }] as any,
  selectedNodeIds: [],
  availableBlockTypes: [],
} as SerializedCanvas;

const baseParsed: AiResponse = {
  explanation: 'ok',
  operations: [{ op: 'autoOrganize' } as any],
};

describe('runPostProcessing', () => {
  beforeEach(() => {
    mocks.createAuditEntry.mockReset();
    mocks.finalizeAuditEntry.mockReset();
    mocks.writeAuditEntry.mockReset();
    mocks.validateCanvas.mockReset();
    mocks.dryRunDeploy.mockReset();
  });

  it('attaches schemaValidation + deployDryRun when both succeed', async () => {
    mocks.validateCanvas.mockResolvedValue({ valid: true, errors: [] });
    mocks.dryRunDeploy.mockResolvedValue({ success: true, deployableCount: 3, error: undefined });

    await runPostProcessing(sentinelAudit, baseParsed, baseCanvas, 'raw response', 1000);

    expect(mocks.finalizeAuditEntry).toHaveBeenCalledTimes(1);
    const finalizeArgs = mocks.finalizeAuditEntry.mock.calls[0][1];
    expect(finalizeArgs.schemaValidation).toEqual({ valid: true, errorCount: 0, errors: [] });
    expect(finalizeArgs.deployDryRun).toEqual({ success: true, deployableCount: 3, error: undefined });
    expect(finalizeArgs.operations).toEqual(baseParsed.operations);
    expect(finalizeArgs.rawResponse).toBe('raw response');
    expect(finalizeArgs.parseSuccess).toBe(true);
    expect(typeof finalizeArgs.durationMs).toBe('number');
    expect(mocks.writeAuditEntry).toHaveBeenCalledWith(sentinelAudit);
  });

  it('omits schemaValidation when validateCanvas rejects (Promise.allSettled boundary)', async () => {
    mocks.validateCanvas.mockRejectedValue(new Error('schema unavailable'));
    mocks.dryRunDeploy.mockResolvedValue({ success: true, deployableCount: 0 });

    await runPostProcessing(sentinelAudit, baseParsed, baseCanvas, 'r', 0);

    const finalizeArgs = mocks.finalizeAuditEntry.mock.calls[0][1];
    expect(finalizeArgs.schemaValidation).toBeUndefined();
    expect(finalizeArgs.deployDryRun).toEqual({ success: true, deployableCount: 0, error: undefined });
    expect(mocks.writeAuditEntry).toHaveBeenCalledTimes(1);
  });

  it('omits deployDryRun when dryRunDeploy rejects', async () => {
    mocks.validateCanvas.mockResolvedValue({ valid: false, errors: ['e1', 'e2'] });
    mocks.dryRunDeploy.mockRejectedValue(new Error('engine unavailable'));

    await runPostProcessing(sentinelAudit, baseParsed, baseCanvas, 'r', 0);

    const finalizeArgs = mocks.finalizeAuditEntry.mock.calls[0][1];
    expect(finalizeArgs.schemaValidation).toEqual({ valid: false, errorCount: 2, errors: ['e1', 'e2'] });
    expect(finalizeArgs.deployDryRun).toBeUndefined();
  });

  it('falls into the catch branch when finalizeAuditEntry throws and emits the bare audit shape', async () => {
    mocks.validateCanvas.mockResolvedValue({ valid: true, errors: [] });
    mocks.dryRunDeploy.mockResolvedValue({ success: true, deployableCount: 0 });
    mocks.finalizeAuditEntry
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockImplementationOnce(() => undefined);

    await runPostProcessing(sentinelAudit, baseParsed, baseCanvas, 'r', 0);

    // First call from the try-block threw; the catch block re-calls
    // finalizeAuditEntry with the SLIM shape (no schemaValidation/deployDryRun).
    expect(mocks.finalizeAuditEntry).toHaveBeenCalledTimes(2);
    const slim = mocks.finalizeAuditEntry.mock.calls[1][1];
    expect(slim.schemaValidation).toBeUndefined();
    expect(slim.deployDryRun).toBeUndefined();
    expect(slim.operations).toEqual(baseParsed.operations);
    expect(slim.rawResponse).toBe('r');
    expect(slim.parseSuccess).toBe(true);
    expect(mocks.writeAuditEntry).toHaveBeenCalledTimes(1);
  });

  it('flags parseSuccess=false when both operations and explanation are empty', async () => {
    mocks.validateCanvas.mockResolvedValue({ valid: true, errors: [] });
    mocks.dryRunDeploy.mockResolvedValue({ success: true, deployableCount: 0 });

    await runPostProcessing(sentinelAudit, { explanation: '', operations: [] }, baseCanvas, 'r', 0);

    expect(mocks.finalizeAuditEntry.mock.calls[0][1].parseSuccess).toBe(false);
  });

  it('flags parseSuccess=true when explanation is non-empty even with no operations', async () => {
    mocks.validateCanvas.mockResolvedValue({ valid: true, errors: [] });
    mocks.dryRunDeploy.mockResolvedValue({ success: true, deployableCount: 0 });

    await runPostProcessing(sentinelAudit, { explanation: 'hi', operations: [] }, baseCanvas, 'r', 0);

    expect(mocks.finalizeAuditEntry.mock.calls[0][1].parseSuccess).toBe(true);
  });

  it('always writes the audit entry, even on the catch path', async () => {
    mocks.validateCanvas.mockResolvedValue({ valid: true, errors: [] });
    mocks.dryRunDeploy.mockResolvedValue({ success: true, deployableCount: 0 });
    mocks.finalizeAuditEntry
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockImplementationOnce(() => undefined);

    await runPostProcessing(sentinelAudit, baseParsed, baseCanvas, 'r', 0);

    expect(mocks.writeAuditEntry).toHaveBeenCalledTimes(1);
    expect(mocks.writeAuditEntry).toHaveBeenCalledWith(sentinelAudit);
  });

  it('forwards canvas.nodes/edges into both validators concurrently', async () => {
    mocks.validateCanvas.mockResolvedValue({ valid: true, errors: [] });
    mocks.dryRunDeploy.mockResolvedValue({ success: true, deployableCount: 0 });

    await runPostProcessing(sentinelAudit, baseParsed, baseCanvas, 'r', 0);

    expect(mocks.validateCanvas).toHaveBeenCalledWith(baseCanvas.nodes, baseCanvas.edges);
    expect(mocks.dryRunDeploy).toHaveBeenCalledWith(baseCanvas.nodes, baseCanvas.edges);
    // Both fired concurrently — order is implementation-defined, both
    // should have been invoked exactly once.
    expect(mocks.validateCanvas).toHaveBeenCalledTimes(1);
    expect(mocks.dryRunDeploy).toHaveBeenCalledTimes(1);
  });

  it('passes through dryRunDeploy.error field when present', async () => {
    mocks.validateCanvas.mockResolvedValue({ valid: true, errors: [] });
    mocks.dryRunDeploy.mockResolvedValue({ success: false, deployableCount: 0, error: 'no creds' });

    await runPostProcessing(sentinelAudit, baseParsed, baseCanvas, 'r', 0);

    expect(mocks.finalizeAuditEntry.mock.calls[0][1].deployDryRun).toEqual({
      success: false,
      deployableCount: 0,
      error: 'no creds',
    });
  });
});
