import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

describe('aws.opensearch.domain handler', () => {
  it('creates the domain and returns the ARN', async () => {
    const os = makeSdkMock({
      client_class_name: 'OpenSearchClient',
      command_class_names: ['CreateDomainCommand', 'DeleteDomainCommand'],
    });
    install_dynamic_import_stub({ '@aws-sdk/client-opensearch': os.module });
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.create(
      'aws.opensearch.domain',
      'search',
      { engine_version: 'OpenSearch_2.13', instance_type: 't3.small.search', instance_count: 1 },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toContain('domain/search');
    expect(os.sendCalls[0].input.ClusterConfig.InstanceCount).toBe(1);
  });
});
