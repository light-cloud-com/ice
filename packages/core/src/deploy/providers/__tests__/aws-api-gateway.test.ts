import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const api = makeSdkMock({
    client_class_name: 'APIGatewayClient',
    command_class_names: ['CreateRestApiCommand', 'CreateDeploymentCommand', 'DeleteRestApiCommand'],
    sendImpl: (cmd) => (cmd.__cmd === 'CreateRestApi' ? { id: 'abc123' } : {}),
  });
  install_dynamic_import_stub({ '@aws-sdk/client-api-gateway': api.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, api };
}

describe('aws.apigateway.restApi handler', () => {
  it('creates REST API + default-stage deployment', async () => {
    const { d, api } = await setup();
    const out = await d.create('aws.apigateway.restApi', 'gw', { endpoint_type: 'REGIONAL', stage_name: 'prod' }, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toContain('/restapis/abc123');
    const cmds = api.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['CreateRestApi', 'CreateDeployment']);
    expect(api.sendCalls[1].input).toEqual({ restApiId: 'abc123', stageName: 'prod' });
  });
});
