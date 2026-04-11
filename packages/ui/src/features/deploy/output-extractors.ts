/**
 * Resource Output Extractors
 *
 * Translates a deployed resource's raw `outputs` blob + `provider_id` into a
 * small presentational record the UI can show directly on the canvas block
 * and in the results panel.
 *
 * Add a new case for each resource type you want to surface. Unknown types
 * return `null` so callers can hide the output pill gracefully.
 */

export interface PrimaryOutput {
  /** Short label like "URL", "IP", "Host". */
  label: string;
  /** The value to display (and copy to clipboard on click). */
  value: string;
  /** Optional — clickable external URL. If unset the value is copy-only. */
  url?: string;
}

export function primaryOutput(
  resourceType: string | undefined,
  outputs: Record<string, unknown> | undefined,
  providerId: string | undefined,
): PrimaryOutput | null {
  if (!resourceType) return null;
  const out = outputs ?? {};

  switch (resourceType) {
    case 'gcp.storage.bucket': {
      const url = (out.url as string) || '';
      const bucket = (out.name as string) || providerId || '';
      if (url) {
        return { label: 'URL', value: url, url };
      }
      if (!bucket) return null;
      return {
        label: 'Bucket',
        value: `gs://${bucket}`,
        url: `https://console.cloud.google.com/storage/browser/${encodeURIComponent(bucket)}`,
      };
    }
    case 'gcp.run.service': {
      const url = (out.url as string) || '';
      if (!url) return null;
      return { label: 'URL', value: url, url };
    }
    case 'gcp.run.job': {
      const name = (out.name as string) || providerId || '';
      return { label: 'Job', value: name };
    }
    case 'gcp.cloudfunctions.function': {
      const url = (out.url as string) || (out.serviceUrl as string) || '';
      if (!url) return null;
      return { label: 'Function', value: url, url };
    }
    case 'gcp.compute.globalForwardingRule': {
      const url = (out.url as string) || '';
      const domain = (out.domain as string) || '';
      const ip = (out.ip_address as string) || (out.IPAddress as string) || '';
      if (url) {
        return { label: domain ? 'Domain' : 'URL', value: url, url };
      }
      if (ip) {
        const fallback = `http://${ip}`;
        return { label: 'IP', value: ip, url: fallback };
      }
      return null;
    }
    case 'gcp.compute.backendBucket': {
      const bucket = (out.bucketName as string) || (out.bucket_name as string) || '';
      return { label: 'Backend', value: bucket || providerId || 'Backend Bucket' };
    }
    case 'gcp.compute.managedSslCertificate': {
      const status = (out.status as string) || (out.cert_status as string) || '';
      const domains = (out.domains as string[] | undefined) || [];
      const primary = domains[0] || '';
      const label = status ? `Cert · ${status}` : 'Cert';
      return { label, value: primary || providerId || 'Managed SSL' };
    }
    case 'gcp.compute.backendService': {
      return { label: 'Backend', value: (out.name as string) || providerId || 'Backend Service' };
    }
    case 'gcp.compute.urlMap': {
      return { label: 'URL Map', value: (out.name as string) || providerId || 'URL Map' };
    }
    case 'gcp.compute.targetHttpsProxy':
    case 'gcp.compute.targetHttpProxy': {
      return { label: 'Proxy', value: (out.name as string) || providerId || 'Proxy' };
    }
    case 'gcp.sql.databaseInstance': {
      const host = (out.connection_name as string) || (out.ip_address as string) || providerId || '';
      if (!host) return null;
      return { label: 'Host', value: host };
    }
    case 'gcp.firestore.database': {
      const name = (out.name as string) || providerId || '';
      return { label: 'Database', value: name };
    }
    case 'gcp.redis.instance': {
      const host = (out.host as string) || (out.ip_address as string) || '';
      const port = (out.port as string | number) || '';
      if (!host) return null;
      return { label: 'Redis', value: port ? `${host}:${port}` : host };
    }
    case 'gcp.pubsub.topic': {
      const name = (out.name as string) || providerId || '';
      return { label: 'Topic', value: name };
    }
    case 'gcp.secretmanager.secret': {
      const name = (out.name as string) || providerId || '';
      return { label: 'Secret', value: name };
    }
    case 'gcp.apigateway.api': {
      const url = (out.default_hostname as string) || (out.url as string) || '';
      if (!url) return null;
      return { label: 'API', value: url, url: url.startsWith('http') ? url : `https://${url}` };
    }
    case 'gcp.container.cluster': {
      const endpoint = (out.endpoint as string) || '';
      if (!endpoint) return null;
      return { label: 'K8s', value: endpoint };
    }
    case 'gcp.firebase.hosting': {
      // Prefer the custom domain when registered, otherwise the
      // default `<site>.web.app`. Both are kept in outputs (`url`
      // points at the custom domain when present, `default_url`
      // always points at the firebase URL) — the result row in the
      // deploy panel uses this primary, and the additional URLs are
      // surfaced separately.
      const customDomainUrl = (out.custom_domain_url as string) || '';
      const defaultUrl = (out.default_url as string) || '';
      const url = customDomainUrl || defaultUrl || (out.url as string) || '';
      if (!url) return null;
      const label = customDomainUrl ? 'Custom Domain' : 'URL';
      return { label, value: url, url };
    }
    default:
      return null;
  }
}

/**
 * Deep-link to the GCP console for a deployed resource. Returns null if we
 * don't have a mapping for the resource type yet.
 */
export function gcpConsoleUrl(
  resourceType: string | undefined,
  providerId: string | undefined,
  project: string | undefined,
): string | null {
  if (!resourceType || !providerId || !project) return null;
  const p = encodeURIComponent(project);
  const id = encodeURIComponent(providerId);

  switch (resourceType) {
    case 'gcp.storage.bucket':
      return `https://console.cloud.google.com/storage/browser/${id}?project=${p}`;
    case 'gcp.run.service':
      return `https://console.cloud.google.com/run?project=${p}`;
    case 'gcp.run.job':
      return `https://console.cloud.google.com/run/jobs?project=${p}`;
    case 'gcp.cloudfunctions.function':
      return `https://console.cloud.google.com/functions/list?project=${p}`;
    case 'gcp.sql.databaseInstance':
      return `https://console.cloud.google.com/sql/instances?project=${p}`;
    case 'gcp.firestore.database':
      return `https://console.cloud.google.com/firestore/data?project=${p}`;
    case 'gcp.redis.instance':
      return `https://console.cloud.google.com/memorystore/redis/instances?project=${p}`;
    case 'gcp.pubsub.topic':
      return `https://console.cloud.google.com/cloudpubsub/topic/list?project=${p}`;
    case 'gcp.pubsub.subscription':
      return `https://console.cloud.google.com/cloudpubsub/subscription/list?project=${p}`;
    case 'gcp.secretmanager.secret':
      return `https://console.cloud.google.com/security/secret-manager?project=${p}`;
    case 'gcp.apigateway.api':
      return `https://console.cloud.google.com/api-gateway/apis?project=${p}`;
    case 'gcp.container.cluster':
      return `https://console.cloud.google.com/kubernetes/list/overview?project=${p}`;
    case 'gcp.compute.globalForwardingRule':
    case 'gcp.compute.backendBucket':
    case 'gcp.compute.backendService':
    case 'gcp.compute.urlMap':
    case 'gcp.compute.targetHttpsProxy':
    case 'gcp.compute.targetHttpProxy':
      return `https://console.cloud.google.com/net-services/loadbalancing/list/loadBalancers?project=${p}`;
    case 'gcp.compute.managedSslCertificate':
      return `https://console.cloud.google.com/security/ccm/list/lbCertificates?project=${p}`;
    case 'gcp.bigquery.dataset':
      return `https://console.cloud.google.com/bigquery?project=${p}`;
    case 'gcp.logging.sink':
      return `https://console.cloud.google.com/logs/router?project=${p}`;
    case 'gcp.firebase.hosting': {
      // provider_id is `firebase://sites/<siteId>` — strip the prefix
      // to derive the site id for the console deep-link.
      const siteId = providerId?.replace(/^firebase:\/\/sites\//, '') || '';
      return `https://console.firebase.google.com/project/${p}/hosting/sites/${encodeURIComponent(siteId)}`;
    }
    default:
      return null;
  }
}
