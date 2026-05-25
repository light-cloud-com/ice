import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const ev = makeSdkMock({
    client_class_name: 'EventBridgeClient',
    command_class_names: ['PutRuleCommand', 'PutTargetsCommand', 'RemoveTargetsCommand', 'DeleteRuleCommand'],
    sendImpl: (cmd) => (cmd.__cmd === 'PutRule' ? { RuleArn: 'arn:aws:events:us-east-1:111:rule/nightly' } : {}),
  });
  install_dynamic_import_stub({ '@aws-sdk/client-eventbridge': ev.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, ev };
}

describe('aws.events.rule handler', () => {
  it('creates a rule and emits PutTargets when target_arn is set', async () => {
    const { d, ev } = await setup();
    const out = await d.create(
      'aws.events.rule',
      'nightly',
      {
        schedule_expression: 'cron(0 0 * * ? *)',
        state: 'ENABLED',
        target_arn: 'arn:aws:lambda:us-east-1:111:function:cleanup',
      },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:events:us-east-1:111:rule/nightly');
    const cmds = ev.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['PutRule', 'PutTargets']);
    expect(ev.sendCalls[1].input.Targets[0].Arn).toContain('lambda');
  });

  it('skips PutTargets when target_arn is absent', async () => {
    const { d, ev } = await setup();
    await d.create('aws.events.rule', 'r', { schedule_expression: 'cron(0 0 * * ? *)', state: 'ENABLED' }, {});
    const cmds = ev.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['PutRule']);
  });
});
