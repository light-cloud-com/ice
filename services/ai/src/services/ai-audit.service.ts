/**
 * AI Audit Logger Service
 *
 * Logs every AI interaction to the database for analysis.
 * Fire-and-forget writes — never blocks the response.
 */

import prisma from '@ice/db';

interface AuditEntry {
  id: string;
  timestamp: string;
  intent: string;
  canvasBefore: {
    nodeCount: number;
    edgeCount: number;
    nodes: Array<{ id: string; iceType?: string; label?: string }>;
    edges: Array<{ source: string; target: string; relationship?: string }>;
  };
  operations: any[];
  rawResponse: string;
  parseSuccess: boolean;
  schemaValidation?: { valid: boolean; errorCount: number; errors?: any[] };
  deployDryRun?: { success: boolean; deployableCount: number; error?: string };
  durationMs: number;
  model: string;
  error?: string;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAuditEntry(intent: string, canvas: any): AuditEntry {
  const nodes = canvas.nodes || [];
  const edges = canvas.edges || [];

  return {
    id: generateId(),
    timestamp: new Date().toISOString(),
    intent,
    canvasBefore: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes: nodes.map((n: any) => ({
        id: n.id,
        iceType: n.data?.iceType || n.iceType,
        label: n.data?.label || n.label,
      })),
      edges: edges.map((e: any) => ({
        source: e.source,
        target: e.target,
        relationship: e.data?.relationship || e.relationship,
      })),
    },
    operations: [],
    rawResponse: '',
    parseSuccess: false,
    durationMs: 0,
    model: 'claude-sonnet-4-20250514',
  };
}

export function finalizeAuditEntry(
  entry: AuditEntry,
  result: {
    operations?: any[];
    rawResponse?: string;
    parseSuccess?: boolean;
    durationMs?: number;
    error?: string;
    schemaValidation?: AuditEntry['schemaValidation'];
    deployDryRun?: AuditEntry['deployDryRun'];
  },
): void {
  entry.operations = result.operations || [];
  entry.rawResponse = result.rawResponse || '';
  entry.parseSuccess = result.parseSuccess ?? false;
  entry.durationMs = result.durationMs || 0;
  entry.error = result.error;
  entry.schemaValidation = result.schemaValidation;
  entry.deployDryRun = result.deployDryRun;
}

/**
 * Write audit entry to database. Fire-and-forget — errors are swallowed.
 */
export function writeAuditEntry(entry: AuditEntry): void {
  // Fire-and-forget
  prisma.aiAuditLog
    .create({
      data: {
        id: entry.id,
        intent: entry.intent,
        canvas_before: entry.canvasBefore as any,
        operations: entry.operations as any,
        raw_response: entry.rawResponse,
        parse_success: entry.parseSuccess,
        schema_validation: (entry.schemaValidation as any) ?? undefined,
        deploy_dry_run: (entry.deployDryRun as any) ?? undefined,
        duration_ms: entry.durationMs,
        model: entry.model,
        error: entry.error ?? null,
      },
    })
    .catch(() => {
      // Silently fail — audit logging should never break the request
    });
}

/**
 * List audit entries (most recent first).
 */
export async function listAuditEntries(limit = 50): Promise<Array<{ id: string; timestamp: string; intent: string }>> {
  try {
    const rows = await prisma.aiAuditLog.findMany({
      select: { id: true, created_at: true, intent: true },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.created_at.toISOString(),
      intent: r.intent,
    }));
  } catch {
    return [];
  }
}

/**
 * Read a single audit entry by ID.
 */
export async function getAuditEntry(id: string): Promise<AuditEntry | null> {
  try {
    const row = await prisma.aiAuditLog.findUnique({ where: { id } });
    if (!row) return null;
    return {
      id: row.id,
      timestamp: row.created_at.toISOString(),
      intent: row.intent,
      canvasBefore: row.canvas_before as AuditEntry['canvasBefore'],
      operations: row.operations as any[],
      rawResponse: row.raw_response,
      parseSuccess: row.parse_success,
      schemaValidation: (row.schema_validation as AuditEntry['schemaValidation']) ?? undefined,
      deployDryRun: (row.deploy_dry_run as AuditEntry['deployDryRun']) ?? undefined,
      durationMs: row.duration_ms,
      model: row.model,
      error: row.error ?? undefined,
    };
  } catch {
    return null;
  }
}
