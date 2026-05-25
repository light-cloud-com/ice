/**
 * Tests for the aws.elasticache.cluster handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const ec = makeSdkMock({
    client_class_name: 'ElastiCacheClient',
    command_class_names: [
      'CreateCacheClusterCommand',
      'CreateReplicationGroupCommand',
      'DeleteCacheClusterCommand',
      'DeleteReplicationGroupCommand',
    ],
  });
  install_dynamic_import_stub({ '@aws-sdk/client-elasticache': ec.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, ec };
}

describe('aws.elasticache.cluster handler', () => {
  it('creates a single-node CacheCluster when num_cache_nodes=1', async () => {
    const { d, ec } = await setup();
    const out = await d.create(
      'aws.elasticache.cluster',
      'cache',
      { cache_node_type: 'cache.t3.micro', num_cache_nodes: 1 },
      {},
    );
    expect(out.success).toBe(true);
    expect(ec.sendCalls[0].__cmd).toBe('CreateCacheCluster');
    expect(ec.sendCalls[0].input.NumCacheNodes).toBe(1);
  });

  it('creates a ReplicationGroup when num_cache_nodes>1', async () => {
    const { d, ec } = await setup();
    const out = await d.create(
      'aws.elasticache.cluster',
      'cache',
      { cache_node_type: 'cache.m5.xlarge', num_cache_nodes: 2 },
      {},
    );
    expect(out.success).toBe(true);
    expect(ec.sendCalls[0].__cmd).toBe('CreateReplicationGroup');
    expect(ec.sendCalls[0].input.NumCacheClusters).toBe(2);
    expect(ec.sendCalls[0].input.AutomaticFailoverEnabled).toBe(true);
  });
});
