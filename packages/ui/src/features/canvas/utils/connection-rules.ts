/**
 * Re-export connection rules from the shared types package.
 * Single source of truth: @ice/types/connection-rules
 *
 * Also includes frontend-only utilities (canvas suggestions)
 * that don't belong in the shared package.
 */

export {
  // Types
  type ConnectionCategory,
  type TrafficType,
  type LineStyle,
  type ConnectionMeta,
  type ConnectionWarning,
  type ConnectionRule,
  // Constants
  CATEGORY_COLORS,
  CATEGORY_TO_RELATIONSHIP,
  CONNECTION_RULES,
  // Classification functions
  isDatabase,
  isCache,
  isQueue,
  isStorage,
  isBackend,
  isFrontend,
  isGateway,
  isAuth,
  isSecrets,
  isMonitoring,
  isSearch,
  isDataWarehouse,
  isVectorDb,
  isLLM,
  isRepo,
  isEnvConfig,
  isDomain,
  isContainer,
  // Core functions
  getDefaultPort,
  getEnvVarName,
  canConnect,
  findConnectionRule,
  getValidTargetIds,
  inferConnectionMeta,
  validateConnection,
  wouldCreateCycle,
  // AI prompt
  generateAiConnectionPrompt,
} from '@ice/types';

// ─── Frontend-only: Canvas pattern suggestions ──────────────────────────────

import { isBackend as _isBackend, isDatabase as _isDatabase, isCache as _isCache } from '@ice/types';

export interface CanvasSuggestion {
  nodeId: string;
  message: string;
  type: 'hint' | 'warning';
}

export function analyzeCanvasPatterns(
  nodes: Array<{ id: string; data?: Record<string, unknown> }>,
  edges: Array<{ source: string; target: string }>,
): CanvasSuggestion[] {
  const suggestions: CanvasSuggestion[] = [];
  const iceTypes = new Map<string, string>();
  for (const n of nodes) {
    const t = (n.data?.iceType as string) || '';
    if (t) iceTypes.set(n.id, t);
  }
  const backends = [...iceTypes.entries()].filter(([_, t]) => _isBackend(t));
  const databases = [...iceTypes.entries()].filter(([_, t]) => _isDatabase(t));
  const caches = [...iceTypes.entries()].filter(([_, t]) => _isCache(t));

  for (const [bId] of backends) {
    const connectedToDb = edges.some(
      (e) =>
        (e.source === bId && databases.some(([dId]) => dId === e.target)) ||
        (e.target === bId && databases.some(([dId]) => dId === e.source)),
    );
    if (!connectedToDb && databases.length === 0) {
      suggestions.push({
        nodeId: bId,
        message: 'This service has no data store. Does it need a database?',
        type: 'hint',
      });
    }
  }
  for (const [dbId] of databases) {
    const connectedBackends = edges.filter(
      (e) =>
        (e.target === dbId && backends.some(([bId]) => bId === e.source)) ||
        (e.source === dbId && backends.some(([bId]) => bId === e.target)),
    );
    if (connectedBackends.length >= 2 && caches.length === 0) {
      suggestions.push({
        nodeId: dbId,
        message: 'Multiple services connect to this database. Consider adding a Redis cache.',
        type: 'hint',
      });
    }
  }
  return suggestions;
}
