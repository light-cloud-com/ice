/**
 * CloudWatch Alarm Handler
 *
 * Handles: aws.cloudwatch.alarm — backs Monitoring.Alert on AWS
 * (parallel to GCP Monitoring AlertPolicy and Azure Insights metric alerts).
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.cloudwatch.alarm';
const SDK = '@aws-sdk/client-cloudwatch';

export const cloudwatch_alarm_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cloudwatch') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'CloudWatch', SDK);

    try {
      const cw = await load_aws_sdk(SDK);
      if (!cw) return sdkMissing(name, TYPE, 'create', start, 'CloudWatch', SDK);
      await client.send(
        new cw.PutMetricAlarmCommand({
          AlarmName: name,
          MetricName: (properties.metric_name as string) || 'CPUUtilization',
          Namespace: (properties.namespace as string) || 'AWS/EC2',
          Statistic: (properties.statistic as string) || 'Average',
          Period: (properties.period_seconds as number) ?? 300,
          EvaluationPeriods: (properties.evaluation_periods as number) ?? 1,
          Threshold: (properties.threshold as number) ?? 80,
          ComparisonOperator: (properties.comparison_operator as string) || 'GreaterThanThreshold',
          ActionsEnabled: properties.actions_enabled !== false,
          AlarmActions: (properties.alarm_actions as string[]) ?? [],
        }),
      );
      const region = ctx.region;
      const accountId = await ctx.ensure_account_id();
      return ok(name, TYPE, 'create', start, {
        provider_id: `arn:aws:cloudwatch:${region}:${accountId}:alarm:${name}`,
      });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, ctx) {
    // PutMetricAlarm is idempotent — re-create with the new shape via create().
    return this.create(name, _properties, ctx);
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cloudwatch') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'CloudWatch SDK not available');
    try {
      const cw = await load_aws_sdk(SDK);
      if (!cw) return err(name, TYPE, 'delete', start, 'CloudWatch SDK not available');
      await client.send(new cw.DeleteAlarmsCommand({ AlarmNames: [name] }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
