/**
 * Smoke tests for every BlockBlueprint export under
 * `packages/ui/src/config/blocks/**`.
 *
 * Each file is a tiny static `export const xBlueprint: BlockBlueprint = {…}`
 * — covering them via per-file tests would be a lot of boilerplate.
 * This single suite imports all of them, asserts the shape contract
 * (iceType, resourceId, name, providers list non-empty), and gives
 * v8 the line coverage it needs to flip the file from 0%.
 */

import { describe, it, expect } from 'vitest';

import { envConfigBlueprint } from '../common/config/env-config';
import { githubRepositoryBlueprint } from '../common/source/github-repository';
import { kubernetesStaticSiteBlueprint } from '../kubernetes/frontend/static-site';
import { kubernetesSsrSiteBlueprint } from '../kubernetes/frontend/ssr-site';
import { kubernetesGatewayBlueprint } from '../kubernetes/networking/gateway';
import { kubernetesScalableBackendBlueprint } from '../kubernetes/backend/scalable-backend';
import { kubernetesScheduledTaskBlueprint } from '../kubernetes/backend/scheduled-task';
import { kubernetesWorkerBlueprint } from '../kubernetes/backend/worker';
import { kubernetesLogsBlueprint } from '../kubernetes/observability/logs';
import { kubernetesStorageBlueprint } from '../kubernetes/storage/storage';
import { kubernetesLlmGatewayBlueprint } from '../kubernetes/ai/llm-gateway';
import { kubernetesRedisCacheBlueprint } from '../kubernetes/data/redis-cache';
import { kubernetesEventStreamBlueprint } from '../kubernetes/messaging/event-stream';
import { kubernetesRabbitmqBlueprint } from '../kubernetes/messaging/rabbitmq';
import { kubernetesSearchBlueprint } from '../kubernetes/analytics/search';
import type { BlockBlueprint } from '../../types';

const allBlueprints: Array<[string, BlockBlueprint]> = [
  ['env-config', envConfigBlueprint],
  ['github-repository', githubRepositoryBlueprint],
  ['static-site', kubernetesStaticSiteBlueprint],
  ['ssr-site', kubernetesSsrSiteBlueprint],
  ['gateway', kubernetesGatewayBlueprint],
  ['scalable-backend', kubernetesScalableBackendBlueprint],
  ['scheduled-task', kubernetesScheduledTaskBlueprint],
  ['worker', kubernetesWorkerBlueprint],
  ['logs', kubernetesLogsBlueprint],
  ['storage', kubernetesStorageBlueprint],
  ['llm-gateway', kubernetesLlmGatewayBlueprint],
  ['redis-cache', kubernetesRedisCacheBlueprint],
  ['event-stream', kubernetesEventStreamBlueprint],
  ['rabbitmq', kubernetesRabbitmqBlueprint],
  ['search', kubernetesSearchBlueprint],
];

describe('config/blocks/** blueprint shape contract', () => {
  it.each(allBlueprints)('%s blueprint has the required BlockBlueprint shape', (name, bp) => {
    expect(bp.iceType).toMatch(/^[A-Z][A-Za-z]+\.[A-Za-z]+/);
    expect(typeof bp.resourceId).toBe('string');
    expect(bp.resourceId.length).toBeGreaterThan(0);
    expect(typeof bp.name).toBe('string');
    expect(bp.name.length).toBeGreaterThan(0);
    expect(typeof bp.description).toBe('string');
    expect(typeof bp.icon).toBe('string');
    expect(typeof bp.category).toBe('string');
    expect(Array.isArray(bp.providers)).toBe(true);
    expect(bp.providers.length).toBeGreaterThan(0);
    expect(typeof bp.nodeData).toBe('object');
  });

  it('every blueprint has a unique resourceId', () => {
    const ids = allBlueprints.map(([, bp]) => bp.resourceId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every blueprint has a unique iceType', () => {
    const types = allBlueprints.map(([, bp]) => bp.iceType);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });
});
