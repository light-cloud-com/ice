/**
 * Post-processing — fire-and-forget audit enrichment that runs after
 * the AI provider returns. Loads the canvas validator + dry-run
 * deployer concurrently, attaches the results to the audit entry,
 * and writes it.
 *
 * Lives in its own module (separate from response-parsing.ts) per
 * the rf-lstream split-by-dependency-surface learning: this
 * function pulls in @ice/db, validators, and the dry-run deploy
 * surface transitively, while response-parsing.ts is dependency-
 * free aside from operation-validation. Splitting the modules
 * keeps the test mock matrix narrow on each side.
 */

import { createAuditEntry, finalizeAuditEntry, writeAuditEntry } from '../ai-audit.service';
import { validateCanvas } from '../canvas-validation.service';
import { dryRunDeploy } from '../deploy-dryrun.service';
import type { AiResponse, SerializedCanvas } from '@ice/types';

export async function runPostProcessing(
  audit: ReturnType<typeof createAuditEntry>,
  parsed: AiResponse,
  canvas: SerializedCanvas,
  rawResponse: string,
  startTime: number,
): Promise<void> {
  try {
    // Run validation + dry-run concurrently
    const [validation, dryRun] = await Promise.allSettled([
      validateCanvas(canvas.nodes as any[], canvas.edges as any[]),
      dryRunDeploy(canvas.nodes as any[], canvas.edges as any[]),
    ]);

    finalizeAuditEntry(audit, {
      operations: parsed.operations,
      rawResponse,
      parseSuccess: parsed.operations.length > 0 || !!parsed.explanation,
      durationMs: Date.now() - startTime,
      schemaValidation:
        validation.status === 'fulfilled'
          ? {
              valid: validation.value.valid,
              errorCount: validation.value.errors.length,
              errors: validation.value.errors,
            }
          : undefined,
      deployDryRun:
        dryRun.status === 'fulfilled'
          ? { success: dryRun.value.success, deployableCount: dryRun.value.deployableCount, error: dryRun.value.error }
          : undefined,
    });
  } catch {
    finalizeAuditEntry(audit, {
      operations: parsed.operations,
      rawResponse,
      parseSuccess: parsed.operations.length > 0 || !!parsed.explanation,
      durationMs: Date.now() - startTime,
    });
  }

  writeAuditEntry(audit);
}
