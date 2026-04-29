/**
 * rf-props-3 — edge-warnings util.
 *
 * Two-warning surface (DB-from-frontend, queue-from-client) driven by
 * case-insensitive regex on srcIceType / tgtIceType. The translation
 * function is stubbed as `t = (k) => k` so assertions can compare
 * directly against the i18n key strings.
 *
 * Push order is significant — when both regexes match (synthetic
 * `'DatabaseQueue'` target), the DB warning must appear before the
 * queue warning, since callers render warnings in array order.
 */

import { describe, it, expect } from 'vitest';
import { computeEdgeWarnings } from '../edge-warnings';

const t = (key: string) => key;

describe('computeEdgeWarnings', () => {
  it('returns no warnings for a non-frontend source paired with a database target', () => {
    expect(computeEdgeWarnings('Backend', 'Database', t)).toEqual([]);
  });

  it('emits a DB-from-frontend warning for (StaticSite, PostgreSQL)', () => {
    expect(computeEdgeWarnings('StaticSite', 'PostgreSQL', t)).toEqual([
      {
        level: 'warning',
        message: 'properties.edge.warningDbFromFrontend',
        suggestion: 'properties.edge.warningDbSuggestion',
      },
    ]);
  });

  it.each([
    ['StaticSite', 'PostgreSQL'],
    ['StaticSite', 'MySQL'],
    ['StaticSite', 'MongoDB'],
    ['StaticSite', 'Database'],
    ['SSRSite', 'PostgreSQL'],
    ['SSRSite', 'MySQL'],
    ['SSRSite', 'MongoDB'],
    ['SSRSite', 'Database'],
    ['Frontend', 'PostgreSQL'],
    ['Frontend', 'MySQL'],
    ['Frontend', 'MongoDB'],
    ['Frontend', 'Database'],
  ])('emits a DB-from-frontend warning for the (%s, %s) frontend×database combo', (src, tgt) => {
    const warnings = computeEdgeWarnings(src, tgt, t);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      level: 'warning',
      message: 'properties.edge.warningDbFromFrontend',
      suggestion: 'properties.edge.warningDbSuggestion',
    });
  });

  it('emits a queue-from-client warning for (SSRSite, SQS)', () => {
    expect(computeEdgeWarnings('SSRSite', 'SQS', t)).toEqual([
      {
        level: 'warning',
        message: 'properties.edge.warningQueueFromClient',
        suggestion: 'properties.edge.warningQueueSuggestion',
      },
    ]);
  });

  it.each([
    ['StaticSite', 'SQS'],
    ['StaticSite', 'SNS'],
    ['StaticSite', 'PubSub'],
    ['StaticSite', 'RabbitMQ'],
    ['StaticSite', 'Queue'],
    ['SSRSite', 'SQS'],
    ['SSRSite', 'SNS'],
    ['SSRSite', 'PubSub'],
    ['SSRSite', 'RabbitMQ'],
    ['SSRSite', 'Queue'],
    ['Frontend', 'SQS'],
    ['Frontend', 'SNS'],
    ['Frontend', 'PubSub'],
    ['Frontend', 'RabbitMQ'],
    ['Frontend', 'Queue'],
  ])('emits a queue-from-client warning for the (%s, %s) frontend×queue combo', (src, tgt) => {
    const warnings = computeEdgeWarnings(src, tgt, t);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      level: 'warning',
      message: 'properties.edge.warningQueueFromClient',
      suggestion: 'properties.edge.warningQueueSuggestion',
    });
  });

  it('emits both warnings (DB before queue) when the target matches both regexes', () => {
    // `DatabaseQueue` triggers /Database/ AND /Queue/ — the push order
    // determines render order, so the DB warning must come first.
    const warnings = computeEdgeWarnings('StaticSite', 'DatabaseQueue', t);
    expect(warnings).toEqual([
      {
        level: 'warning',
        message: 'properties.edge.warningDbFromFrontend',
        suggestion: 'properties.edge.warningDbSuggestion',
      },
      {
        level: 'warning',
        message: 'properties.edge.warningQueueFromClient',
        suggestion: 'properties.edge.warningQueueSuggestion',
      },
    ]);
  });

  it('matches case-insensitively (lowercase staticsite + mongodb still triggers the DB warning)', () => {
    const warnings = computeEdgeWarnings('staticsite', 'mongodb', t);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toBe('properties.edge.warningDbFromFrontend');
  });

  it('returns no warnings when source is non-frontend even if target matches a DB regex', () => {
    expect(computeEdgeWarnings('Backend', 'MongoDB', t)).toEqual([]);
  });

  it('returns no warnings when target does not match either regex', () => {
    expect(computeEdgeWarnings('StaticSite', 'Storage.Bucket', t)).toEqual([]);
  });

  it('returns no warnings when both source and target are empty strings', () => {
    expect(computeEdgeWarnings('', '', t)).toEqual([]);
  });
});
