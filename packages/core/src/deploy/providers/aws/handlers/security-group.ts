/**
 * AWS Security Group handler — `aws.ec2.securityGroup`.
 *
 * AWS security groups are stateful firewalls attached to a VPC. The
 * handler creates the group then applies the operator-supplied
 * ingress + egress rules in a single AuthorizeSecurityGroup{In,E}gress
 * call each.
 *
 * Default (AWS-provided) egress allow-all is left as-is unless
 * `revoke_default_egress: true` is set — many production setups want
 * to lock egress down explicitly.
 *
 * Mirrors the conceptual surface of GCP's cloud-armor + firewall
 * rules, but the implementation is a single EC2 SDK call.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.ec2.securityGroup';
const SDK = '@aws-sdk/client-ec2';

interface IngressRule {
  protocol?: string;
  from_port?: number;
  to_port?: number;
  cidr_blocks?: string[];
  source_security_group_ids?: string[];
  description?: string;
}

function rule_to_ip_permission(rule: IngressRule): Record<string, unknown> {
  return {
    IpProtocol: rule.protocol ?? 'tcp',
    FromPort: rule.from_port,
    ToPort: rule.to_port,
    IpRanges: (rule.cidr_blocks ?? []).map((CidrIp) => ({ CidrIp, Description: rule.description })),
    UserIdGroupPairs: (rule.source_security_group_ids ?? []).map((GroupId) => ({
      GroupId,
      Description: rule.description,
    })),
  };
}

function tag_specs(
  name: string,
  tags: Record<string, string> | undefined,
): Array<{ ResourceType: string; Tags: Array<{ Key: string; Value: string }> }> {
  const base = [{ Key: 'Name', Value: name }];
  const extra = Object.entries(tags ?? {}).map(([Key, Value]) => ({ Key, Value }));
  return [{ ResourceType: 'security-group', Tags: [...base, ...extra] }];
}

export const security_group_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'EC2', SDK);

    const vpcId = properties.vpc_id as string;
    if (!vpcId) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'Security group create refused: vpc_id is required (connect a Network.VPC block).',
      );
    }

    try {
      const ec2 = await load_aws_sdk(SDK);
      if (!ec2) return sdkMissing(name, TYPE, 'create', start, 'EC2', SDK);

      const description = (properties.description as string) || `ICE-managed ${name}`;
      const created = await client.send(
        new ec2.CreateSecurityGroupCommand({
          GroupName: name,
          Description: description,
          VpcId: vpcId,
          TagSpecifications: tag_specs(name, properties.tags as Record<string, string>),
        }),
      );
      const groupId = created?.GroupId;
      if (!groupId) return err(name, TYPE, 'create', start, 'CreateSecurityGroup returned no GroupId');

      const ingress = (properties.ingress as IngressRule[]) ?? [];
      if (ingress.length > 0) {
        await client.send(
          new ec2.AuthorizeSecurityGroupIngressCommand({
            GroupId: groupId,
            IpPermissions: ingress.map(rule_to_ip_permission),
          }),
        );
      }

      const egress = (properties.egress as IngressRule[]) ?? [];
      if (egress.length > 0) {
        await client.send(
          new ec2.AuthorizeSecurityGroupEgressCommand({
            GroupId: groupId,
            IpPermissions: egress.map(rule_to_ip_permission),
          }),
        );
      }

      if (properties.revoke_default_egress === true) {
        // AWS auto-attaches a 0.0.0.0/0 allow-all egress; revoke it.
        await client.send(
          new ec2.RevokeSecurityGroupEgressCommand({
            GroupId: groupId,
            IpPermissions: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
          }),
        );
      }

      return ok(name, TYPE, 'create', start, { provider_id: groupId });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return sdkMissing(name, TYPE, 'update', start, 'EC2', SDK);

    try {
      const ec2 = await load_aws_sdk(SDK);
      if (!ec2) return sdkMissing(name, TYPE, 'update', start, 'EC2', SDK);

      // Update is rule-replace, not patch. AWS SG mutation is fiddly —
      // for a clean diff, the caller computes the set difference and
      // calls update with only the new rules to add. The handler does
      // a tag refresh + optional rule re-apply.
      if (properties.tags) {
        const tags = Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value }));
        await client.send(
          new ec2.CreateTagsCommand({
            Resources: [provider_id],
            Tags: [{ Key: 'Name', Value: name }, ...tags],
          }),
        );
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return sdkMissing(name, TYPE, 'delete', start, 'EC2', SDK);

    try {
      const ec2 = await load_aws_sdk(SDK);
      if (!ec2) return sdkMissing(name, TYPE, 'delete', start, 'EC2', SDK);

      await client.send(new ec2.DeleteSecurityGroupCommand({ GroupId: provider_id }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
