/**
 * Tests for the aws.codebuild.project handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const cb = makeSdkMock({
    client_class_name: 'CodeBuildClient',
    command_class_names: ['CreateProjectCommand', 'UpdateProjectCommand', 'DeleteProjectCommand'],
    sendImpl: (cmd) =>
      cmd.__cmd === 'CreateProject' ? { project: { arn: 'arn:aws:codebuild:us-east-1:111:project/my-build' } } : {},
  });
  install_dynamic_import_stub({ '@aws-sdk/client-codebuild': cb.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, cb };
}

describe('aws.codebuild.project handler', () => {
  it('creates a project with operator-supplied source + role', async () => {
    const { d, cb } = await setup();
    const out = await d.create(
      'aws.codebuild.project',
      'my-build',
      {
        source_location: 'https://github.com/org/repo.git',
        service_role_arn: 'arn:aws:iam::111:role/codebuild',
        image: 'aws/codebuild/standard:7.0',
      },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:codebuild:us-east-1:111:project/my-build');
    const create = cb.sendCalls.find((c: any) => c.__cmd === 'CreateProject')!;
    expect(create.input.source.location).toBe('https://github.com/org/repo.git');
    expect(create.input.serviceRole).toBe('arn:aws:iam::111:role/codebuild');
  });

  it('refuses to create without source_location', async () => {
    const { d } = await setup();
    const out = await d.create(
      'aws.codebuild.project',
      'my-build',
      { service_role_arn: 'arn:aws:iam::111:role/codebuild' },
      {},
    );
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/source_location/);
  });

  it('refuses to create without service_role_arn', async () => {
    const { d } = await setup();
    const out = await d.create('aws.codebuild.project', 'my-build', { source_location: 'x' }, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/service_role_arn/);
  });

  it('deletes via DeleteProject', async () => {
    const { d, cb } = await setup();
    const out = await d.delete(
      'aws.codebuild.project',
      'my-build',
      'arn:aws:codebuild:us-east-1:111:project/my-build',
      {},
    );
    expect(out.success).toBe(true);
    expect(cb.sendCalls.find((c: any) => c.__cmd === 'DeleteProject')!.input.name).toBe('my-build');
  });
});
