/**
 * Generic Resource Controller managed-instance handler — single
 * helper backs:
 *   - `ibm.cis.zone`              (CIS instance + zone — operator manages zones separately)
 *   - `ibm.containers.cluster`    (IKS cluster — uses Container Service REST under the hood)
 *   - `ibm.containerregistry.namespace`
 *   - `ibm.appid.instance`
 *   - `ibm.logging.instance`
 *   - `ibm.eventnotifications.instance`
 *   - `ibm.monitoring.alert` (Sysdig — instance per project)
 *   - `ibm.watsonx.deployment` (deployment is a sub-resource; we model
 *     the project instance here)
 *
 * Each variant is a Resource Controller managed service with a fixed
 * `service_name` (catalog ID) + `plan_id`. Per-resource configuration
 * happens via service-specific REST after the instance lands; that
 * layer is operator-driven and not modeled here.
 */

import { resolveClient } from './_client';
import { err, isIbmAlreadyExists, isIbmNotFound, ok, sdkMissing } from './_result';
import type { IBMResourceHandler } from '../types';

const SDK = '@ibm-cloud/platform-services';

function makeHandler(type: string, plan: { service_name: string; plan_id: string }): IBMResourceHandler {
  return {
    async create(name, properties, ctx) {
      const start = Date.now();
      const rc = await resolveClient(ctx, 'resourcecontroller');
      if (!rc) return sdkMissing(name, type, 'create', start, 'IBM Resource Controller', SDK);
      try {
        const result = await rc.createResourceInstance({
          name,
          target: ctx.region,
          resourceGroup: ctx.resource_group_id,
          resourcePlanId: (properties.plan_id as string) || plan.plan_id,
          parameters: properties.parameters as Record<string, unknown> | undefined,
        });
        const id = result?.result?.id as string | undefined;
        if (!id) return err(name, type, 'create', start, 'createResourceInstance returned no id');
        return ok(name, type, 'create', start, { provider_id: id });
      } catch (error) {
        if (isIbmAlreadyExists(error)) return ok(name, type, 'create', start, { provider_id: name });
        return err(name, type, 'create', start, error instanceof Error ? error.message : String(error));
      }
    },
    async update(name, provider_id, _properties, _current, ctx) {
      const start = Date.now();
      const rc = await resolveClient(ctx, 'resourcecontroller');
      if (!rc) return err(name, type, 'update', start, 'IBM Resource Controller SDK not available');
      try {
        await rc.updateResourceInstance({ id: provider_id, name });
        return ok(name, type, 'update', start, { provider_id });
      } catch (error) {
        return err(name, type, 'update', start, error instanceof Error ? error.message : String(error));
      }
    },
    async delete(name, provider_id, ctx) {
      const start = Date.now();
      const rc = await resolveClient(ctx, 'resourcecontroller');
      if (!rc) return err(name, type, 'delete', start, 'IBM Resource Controller SDK not available');
      try {
        await rc.deleteResourceInstance({ id: provider_id, recursive: true });
        return ok(name, type, 'delete', start);
      } catch (error) {
        if (isIbmNotFound(error)) return ok(name, type, 'delete', start);
        return err(name, type, 'delete', start, error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export const cis_zone_handler = makeHandler('ibm.cis.zone', {
  service_name: 'internet-svcs',
  plan_id: 'free',
});
export const cis_wafrule_handler = makeHandler('ibm.cis.wafrule', {
  service_name: 'internet-svcs',
  plan_id: 'standard',
});
export const containers_cluster_handler = makeHandler('ibm.containers.cluster', {
  service_name: 'containers-kubernetes',
  plan_id: 'free',
});
export const containerregistry_namespace_handler = makeHandler('ibm.containerregistry.namespace', {
  service_name: 'container-registry',
  plan_id: 'standard',
});
export const appid_instance_handler = makeHandler('ibm.appid.instance', {
  service_name: 'appid',
  plan_id: 'graduated-tier',
});
export const secretsmanager_importedcert_handler = makeHandler('ibm.secretsmanager.importedcert', {
  service_name: 'secrets-manager',
  plan_id: 'standard',
});
export const logging_instance_handler = makeHandler('ibm.logging.instance', {
  service_name: 'logdna',
  plan_id: '7-days',
});
export const eventnotifications_instance_handler = makeHandler('ibm.eventnotifications.instance', {
  service_name: 'event-notifications',
  plan_id: 'lite',
});
export const monitoring_alert_handler = makeHandler('ibm.monitoring.alert', {
  service_name: 'sysdig-monitor',
  plan_id: 'graduated-tier',
});
export const watsonx_deployment_handler = makeHandler('ibm.watsonx.deployment', {
  service_name: 'watsonx-ai',
  plan_id: 'essentials',
});
export const mq_queuemanager_handler = makeHandler('ibm.mq.queuemanager', {
  service_name: 'mqcloud',
  plan_id: 'mqcloud-standard',
});
export const eventstreams_topic_handler = makeHandler('ibm.eventstreams.topic', {
  service_name: 'messagehub',
  plan_id: 'standard',
});
export const cloudant_database_handler = makeHandler('ibm.cloudant.database', {
  service_name: 'cloudantnosqldb',
  plan_id: 'standard',
});
