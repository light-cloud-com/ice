/**
 * Pure check for likely-misconfigured edges between two nodes.
 *
 * Surfaces user-facing warnings via i18n keys when a connection looks
 * suspicious — currently:
 *   - frontend → database (clients shouldn't talk to a DB directly), and
 *   - frontend → queue   (clients shouldn't publish straight to a queue).
 *
 * The translation function `t` is passed in as a parameter (rather than
 * imported here) to keep this util free of i18n / module-singleton wiring,
 * so it can be unit-tested with a stub `t = (k) => k`.
 *
 * Inline lightweight checks (avoiding importing from canvas utils in
 * properties): we deliberately don't reach into
 * `canvas/utils/connection-rules.ts` here — keeping the properties feature
 * decoupled from canvas-internal heuristics is intentional.
 *
 * Push order is significant: the DB warning is emitted before the queue
 * warning when both regexes match, since callers render warnings in array
 * order.
 */

export interface EdgeWarning {
  level: 'warning' | string;
  message: string;
  suggestion?: string;
}

export function computeEdgeWarnings(srcIceType: string, tgtIceType: string, t: (key: string) => string): EdgeWarning[] {
  const edgeWarnings: EdgeWarning[] = [];
  // Inline lightweight checks (avoiding importing from canvas utils in properties)
  if (/StaticSite|SSRSite|Frontend/i.test(srcIceType) && /Database|PostgreSQL|MySQL|MongoDB/i.test(tgtIceType)) {
    edgeWarnings.push({
      level: 'warning',
      message: t('properties.edge.warningDbFromFrontend'),
      suggestion: t('properties.edge.warningDbSuggestion'),
    });
  }
  if (/StaticSite|SSRSite|Frontend/i.test(srcIceType) && /Queue|SQS|SNS|PubSub|RabbitMQ/i.test(tgtIceType)) {
    edgeWarnings.push({
      level: 'warning',
      message: t('properties.edge.warningQueueFromClient'),
      suggestion: t('properties.edge.warningQueueSuggestion'),
    });
  }
  return edgeWarnings;
}
