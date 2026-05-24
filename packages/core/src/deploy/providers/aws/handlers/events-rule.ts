/**
 * EventBridge Rule Handler
 *
 * Handles: aws.events.rule
 *
 * PutRule (schedule + state) → optional PutTargets when target_arn
 * is set. CronJob on the canvas wires this rule to a Lambda
 * (target_type='lambda') today; future ECS/StepFunctions targets
 * just add a new target_type branch.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.events.rule';
const SDK = '@aws-sdk/client-eventbridge';

export const events_rule_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('eventbridge') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'EventBridge', SDK);

    try {
      const ev = await load_aws_sdk(SDK);
      if (!ev) return sdkMissing(name, TYPE, 'create', start, 'EventBridge', SDK);

      const put = await client.send(
        new ev.PutRuleCommand({
          Name: name,
          ScheduleExpression: properties.schedule_expression as string,
          Description: properties.description as string,
          State: (properties.state as string) || 'ENABLED',
        }),
      );

      if (properties.target_arn) {
        await client.send(
          new ev.PutTargetsCommand({
            Rule: name,
            Targets: [{ Id: '1', Arn: properties.target_arn as string }],
          }),
        );
      }

      return ok(name, TYPE, 'create', start, {
        provider_id: put?.RuleArn || `arn:aws:events:${ctx.region}:*:rule/${name}`,
      });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    // PutRule is upsert — call it again to update.
    return this.create(name, properties, ctx).then((r) => ({ ...r, action: 'update', provider_id }));
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('eventbridge') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'EventBridge SDK not available');

    try {
      const ev = await load_aws_sdk(SDK);
      if (!ev) return err(name, TYPE, 'delete', start, 'EventBridge SDK not available');

      // Targets must be detached before the rule can be deleted.
      try {
        await client.send(new ev.RemoveTargetsCommand({ Rule: name, Ids: ['1'] }));
      } catch {
        /* no targets attached — ignore */
      }
      await client.send(new ev.DeleteRuleCommand({ Name: name }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
