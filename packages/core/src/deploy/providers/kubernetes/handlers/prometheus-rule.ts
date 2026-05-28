/**
 * Prometheus PrometheusRule handler — `k8s.monitoring.prometheusrule`.
 *
 * Backs Monitoring.Alert on Kubernetes when the Prometheus Operator is
 * installed. CRD: monitoring.coreos.com/v1/PrometheusRule.
 */

import { createCrd, deleteCrd, parseCrdProviderId, replaceCrd } from './_crd';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.monitoring.prometheusrule';
const SDK = '@kubernetes/client-node';
const REF = { group: 'monitoring.coreos.com', version: 'v1', plural: 'prometheusrules' };

function buildRuleBody(name: string, namespace: string, properties: Record<string, unknown>): unknown {
  return {
    apiVersion: 'monitoring.coreos.com/v1',
    kind: 'PrometheusRule',
    metadata: { name, namespace, labels: { 'app.kubernetes.io/managed-by': 'ice' } },
    spec: {
      groups: (properties.groups as unknown[]) ?? [
        {
          name: (properties.group_name as string) || `${name}-group`,
          rules: (properties.rules as unknown[]) ?? [
            {
              alert: (properties.alert_name as string) || name,
              expr: (properties.expr as string) || 'up == 0',
              for: (properties.for as string) || '5m',
              labels: { severity: (properties.severity as string) || 'warning' },
              annotations: properties.annotations as Record<string, string> | undefined,
            },
          ],
        },
      ],
    },
  };
}

export const prometheus_rule_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.clients.get('custom')) return sdkMissing(name, TYPE, 'create', start, 'CustomObjectsApi', SDK);
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const { id } = await createCrd(ctx, REF, namespace, buildRuleBody(name, namespace, properties));
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    try {
      const { namespace } = parseCrdProviderId(provider_id, ctx.namespace);
      await replaceCrd(ctx, REF, namespace, name, buildRuleBody(name, namespace, properties));
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    try {
      const { namespace } = parseCrdProviderId(provider_id, ctx.namespace);
      await deleteCrd(ctx, REF, namespace, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
