/**
 * `output-extractors.ts` invariant tests.
 *
 * Two pure functions:
 *   - `primaryOutput(resourceType, outputs, providerId)` — returns the
 *     `{ label, value, url? }` triple the deploy panel surfaces on the
 *     canvas pill, or `null` when no display row applies. Eighteen
 *     resource-type cases plus `default`.
 *   - `gcpConsoleUrl(resourceType, providerId, project)` — returns a deep
 *     link to the GCP console, or `null` when an arg is missing or the
 *     resource type isn't mapped.
 *
 * Branch coverage matters more than line coverage here: every `||` chain
 * has at least two paths (truthy → take it, falsy → fall through), and
 * the firebase-hosting case has a four-arm preference cascade
 * (`custom_domain_url` > `default_url` > `url` > null) that needs each
 * arm exercised.
 */

import { describe, it, expect } from 'vitest';
import { primaryOutput, gcpConsoleUrl } from '../output-extractors';

// ─── primaryOutput — early returns ─────────────────────────────────────────

describe('primaryOutput (early returns)', () => {
  it('returns null when resourceType is undefined', () => {
    expect(primaryOutput(undefined, { url: 'x' }, 'p')).toBeNull();
  });

  it('returns null when resourceType is empty string', () => {
    expect(primaryOutput('', { url: 'x' }, 'p')).toBeNull();
  });

  it('uses an empty outputs object when outputs is undefined', () => {
    // Falls through to the unknown-type default (returns null) but exercises
    // the `out = outputs ?? {}` fallback.
    expect(primaryOutput('unknown.unmapped.type', undefined, 'p')).toBeNull();
  });

  it('returns null for unknown / unmapped resource types', () => {
    expect(primaryOutput('aws.lambda.function', {}, 'p')).toBeNull();
    expect(primaryOutput('something.completely.different', { url: 'x' }, 'p')).toBeNull();
  });
});

// ─── gcp.storage.bucket ────────────────────────────────────────────────────

describe('primaryOutput — gcp.storage.bucket', () => {
  it('returns the URL row when outputs.url is set', () => {
    expect(primaryOutput('gcp.storage.bucket', { url: 'https://x' }, 'pid')).toEqual({
      label: 'URL',
      value: 'https://x',
      url: 'https://x',
    });
  });

  it('returns the gs:// row when outputs.name is set and url is empty', () => {
    expect(primaryOutput('gcp.storage.bucket', { name: 'my-bucket' }, undefined)).toEqual({
      label: 'Bucket',
      value: 'gs://my-bucket',
      url: 'https://console.cloud.google.com/storage/browser/my-bucket',
    });
  });

  it('falls back to providerId when name is missing', () => {
    expect(primaryOutput('gcp.storage.bucket', {}, 'fallback-bucket')).toEqual({
      label: 'Bucket',
      value: 'gs://fallback-bucket',
      url: 'https://console.cloud.google.com/storage/browser/fallback-bucket',
    });
  });

  it('returns null when both url and bucket name are absent', () => {
    expect(primaryOutput('gcp.storage.bucket', {}, undefined)).toBeNull();
    expect(primaryOutput('gcp.storage.bucket', {}, '')).toBeNull();
  });

  it('URL-encodes the bucket name in the console deep-link', () => {
    const out = primaryOutput('gcp.storage.bucket', { name: 'my bucket/x' }, undefined);
    expect(out?.url).toContain('my%20bucket%2Fx');
  });
});

// ─── gcp.run.service ───────────────────────────────────────────────────────

describe('primaryOutput — gcp.run.service', () => {
  it('returns the URL row when outputs.url is set', () => {
    expect(primaryOutput('gcp.run.service', { url: 'https://svc.run' }, 'pid')).toEqual({
      label: 'URL',
      value: 'https://svc.run',
      url: 'https://svc.run',
    });
  });

  it('returns null when url is missing or empty', () => {
    expect(primaryOutput('gcp.run.service', {}, 'pid')).toBeNull();
    expect(primaryOutput('gcp.run.service', { url: '' }, 'pid')).toBeNull();
  });
});

// ─── gcp.run.job ───────────────────────────────────────────────────────────

describe('primaryOutput — gcp.run.job', () => {
  it('returns the Job row with outputs.name when present', () => {
    expect(primaryOutput('gcp.run.job', { name: 'my-job' }, 'pid')).toEqual({
      label: 'Job',
      value: 'my-job',
    });
  });

  it('falls back to providerId when name is missing', () => {
    expect(primaryOutput('gcp.run.job', {}, 'fallback-job')).toEqual({
      label: 'Job',
      value: 'fallback-job',
    });
  });

  it('returns the Job row with empty value when both are missing', () => {
    expect(primaryOutput('gcp.run.job', {}, undefined)).toEqual({
      label: 'Job',
      value: '',
    });
  });
});

// ─── gcp.cloudfunctions.function ───────────────────────────────────────────

describe('primaryOutput — gcp.cloudfunctions.function', () => {
  it('prefers outputs.url over outputs.serviceUrl', () => {
    expect(
      primaryOutput('gcp.cloudfunctions.function', { url: 'https://primary', serviceUrl: 'https://other' }, 'pid'),
    ).toEqual({
      label: 'Function',
      value: 'https://primary',
      url: 'https://primary',
    });
  });

  it('falls back to outputs.serviceUrl when url is missing', () => {
    expect(primaryOutput('gcp.cloudfunctions.function', { serviceUrl: 'https://svc' }, 'pid')).toEqual({
      label: 'Function',
      value: 'https://svc',
      url: 'https://svc',
    });
  });

  it('returns null when both url and serviceUrl are missing', () => {
    expect(primaryOutput('gcp.cloudfunctions.function', {}, 'pid')).toBeNull();
  });
});

// ─── gcp.compute.globalForwardingRule ──────────────────────────────────────

describe('primaryOutput — gcp.compute.globalForwardingRule', () => {
  it('uses Domain label when outputs.url AND outputs.domain are set', () => {
    expect(
      primaryOutput('gcp.compute.globalForwardingRule', { url: 'https://app', domain: 'app.example.com' }, 'pid'),
    ).toEqual({
      label: 'Domain',
      value: 'https://app',
      url: 'https://app',
    });
  });

  it('uses URL label when outputs.url is set but domain is empty', () => {
    expect(primaryOutput('gcp.compute.globalForwardingRule', { url: 'https://app' }, 'pid')).toEqual({
      label: 'URL',
      value: 'https://app',
      url: 'https://app',
    });
  });

  it('uses IP label when only outputs.ip_address is set', () => {
    expect(primaryOutput('gcp.compute.globalForwardingRule', { ip_address: '1.2.3.4' }, 'pid')).toEqual({
      label: 'IP',
      value: '1.2.3.4',
      url: 'http://1.2.3.4',
    });
  });

  it('falls back to IPAddress (capital A) when ip_address is absent', () => {
    expect(primaryOutput('gcp.compute.globalForwardingRule', { IPAddress: '5.6.7.8' }, 'pid')).toEqual({
      label: 'IP',
      value: '5.6.7.8',
      url: 'http://5.6.7.8',
    });
  });

  it('returns null when neither url nor ip is provided', () => {
    expect(primaryOutput('gcp.compute.globalForwardingRule', {}, 'pid')).toBeNull();
  });
});

// ─── gcp.compute.backendBucket ─────────────────────────────────────────────

describe('primaryOutput — gcp.compute.backendBucket', () => {
  it('prefers outputs.bucketName (camelCase)', () => {
    expect(
      primaryOutput('gcp.compute.backendBucket', { bucketName: 'b-camel', bucket_name: 'b-snake' }, 'pid'),
    ).toEqual({ label: 'Backend', value: 'b-camel' });
  });

  it('falls back to outputs.bucket_name (snake_case)', () => {
    expect(primaryOutput('gcp.compute.backendBucket', { bucket_name: 'b-snake' }, 'pid')).toEqual({
      label: 'Backend',
      value: 'b-snake',
    });
  });

  it('falls back to providerId when both bucket-name keys are missing', () => {
    expect(primaryOutput('gcp.compute.backendBucket', {}, 'pid-fallback')).toEqual({
      label: 'Backend',
      value: 'pid-fallback',
    });
  });

  it('falls back to "Backend Bucket" string when no providerId either', () => {
    expect(primaryOutput('gcp.compute.backendBucket', {}, undefined)).toEqual({
      label: 'Backend',
      value: 'Backend Bucket',
    });
  });
});

// ─── gcp.compute.managedSslCertificate ─────────────────────────────────────

describe('primaryOutput — gcp.compute.managedSslCertificate', () => {
  it('prefixes label with status when outputs.status is set', () => {
    expect(primaryOutput('gcp.compute.managedSslCertificate', { status: 'ACTIVE', domains: ['a.com'] }, 'pid')).toEqual(
      { label: 'Cert · ACTIVE', value: 'a.com' },
    );
  });

  it('falls back to outputs.cert_status when status is missing', () => {
    expect(
      primaryOutput('gcp.compute.managedSslCertificate', { cert_status: 'PROVISIONING', domains: ['a.com'] }, 'pid'),
    ).toEqual({ label: 'Cert · PROVISIONING', value: 'a.com' });
  });

  it('uses bare "Cert" label when neither status field is present', () => {
    expect(primaryOutput('gcp.compute.managedSslCertificate', { domains: ['x.com'] }, 'pid')).toEqual({
      label: 'Cert',
      value: 'x.com',
    });
  });

  it('uses providerId when domains array is empty', () => {
    expect(primaryOutput('gcp.compute.managedSslCertificate', { domains: [] }, 'pid-fallback')).toEqual({
      label: 'Cert',
      value: 'pid-fallback',
    });
  });

  it('uses "Managed SSL" string when no domain and no providerId', () => {
    expect(primaryOutput('gcp.compute.managedSslCertificate', {}, undefined)).toEqual({
      label: 'Cert',
      value: 'Managed SSL',
    });
  });

  it('uses domains[0] verbatim when present', () => {
    expect(primaryOutput('gcp.compute.managedSslCertificate', { domains: ['first.com', 'second.com'] }, 'pid')).toEqual(
      { label: 'Cert', value: 'first.com' },
    );
  });
});

// ─── gcp.compute.backendService ────────────────────────────────────────────

describe('primaryOutput — gcp.compute.backendService', () => {
  it('uses outputs.name when present', () => {
    expect(primaryOutput('gcp.compute.backendService', { name: 'bs-name' }, 'pid')).toEqual({
      label: 'Backend',
      value: 'bs-name',
    });
  });

  it('falls back to providerId when name is missing', () => {
    expect(primaryOutput('gcp.compute.backendService', {}, 'pid-fallback')).toEqual({
      label: 'Backend',
      value: 'pid-fallback',
    });
  });

  it('falls back to "Backend Service" when both are missing', () => {
    expect(primaryOutput('gcp.compute.backendService', {}, undefined)).toEqual({
      label: 'Backend',
      value: 'Backend Service',
    });
  });
});

// ─── gcp.compute.urlMap ────────────────────────────────────────────────────

describe('primaryOutput — gcp.compute.urlMap', () => {
  it('uses outputs.name when present', () => {
    expect(primaryOutput('gcp.compute.urlMap', { name: 'm-name' }, 'pid')).toEqual({
      label: 'URL Map',
      value: 'm-name',
    });
  });

  it('falls back to providerId when name is missing', () => {
    expect(primaryOutput('gcp.compute.urlMap', {}, 'pid')).toEqual({
      label: 'URL Map',
      value: 'pid',
    });
  });

  it('falls back to "URL Map" string when both are missing', () => {
    expect(primaryOutput('gcp.compute.urlMap', {}, undefined)).toEqual({
      label: 'URL Map',
      value: 'URL Map',
    });
  });
});

// ─── gcp.compute.targetHttp(s)?Proxy ───────────────────────────────────────

describe('primaryOutput — targetHttp(s)?Proxy', () => {
  it('returns the Proxy row for targetHttpsProxy with outputs.name', () => {
    expect(primaryOutput('gcp.compute.targetHttpsProxy', { name: 'p-https' }, 'pid')).toEqual({
      label: 'Proxy',
      value: 'p-https',
    });
  });

  it('returns the Proxy row for targetHttpProxy with outputs.name', () => {
    expect(primaryOutput('gcp.compute.targetHttpProxy', { name: 'p-http' }, 'pid')).toEqual({
      label: 'Proxy',
      value: 'p-http',
    });
  });

  it('falls back to providerId for targetHttpProxy', () => {
    expect(primaryOutput('gcp.compute.targetHttpProxy', {}, 'pid')).toEqual({
      label: 'Proxy',
      value: 'pid',
    });
  });

  it('falls back to "Proxy" string for targetHttpsProxy when both are missing', () => {
    expect(primaryOutput('gcp.compute.targetHttpsProxy', {}, undefined)).toEqual({
      label: 'Proxy',
      value: 'Proxy',
    });
  });
});

// ─── gcp.sql.databaseInstance ──────────────────────────────────────────────

describe('primaryOutput — gcp.sql.databaseInstance', () => {
  it('prefers outputs.connection_name', () => {
    expect(
      primaryOutput('gcp.sql.databaseInstance', { connection_name: 'c-name', ip_address: '1.1.1.1' }, 'pid'),
    ).toEqual({ label: 'Host', value: 'c-name' });
  });

  it('falls back to outputs.ip_address', () => {
    expect(primaryOutput('gcp.sql.databaseInstance', { ip_address: '1.1.1.1' }, 'pid')).toEqual({
      label: 'Host',
      value: '1.1.1.1',
    });
  });

  it('falls back to providerId', () => {
    expect(primaryOutput('gcp.sql.databaseInstance', {}, 'pid-fallback')).toEqual({
      label: 'Host',
      value: 'pid-fallback',
    });
  });

  it('returns null when nothing is present', () => {
    expect(primaryOutput('gcp.sql.databaseInstance', {}, undefined)).toBeNull();
    expect(primaryOutput('gcp.sql.databaseInstance', {}, '')).toBeNull();
  });
});

// ─── gcp.firestore.database ────────────────────────────────────────────────

describe('primaryOutput — gcp.firestore.database', () => {
  it('uses outputs.name when present', () => {
    expect(primaryOutput('gcp.firestore.database', { name: 'db' }, 'pid')).toEqual({
      label: 'Database',
      value: 'db',
    });
  });

  it('falls back to providerId', () => {
    expect(primaryOutput('gcp.firestore.database', {}, 'pid-fallback')).toEqual({
      label: 'Database',
      value: 'pid-fallback',
    });
  });

  it('returns empty value when both are missing', () => {
    expect(primaryOutput('gcp.firestore.database', {}, undefined)).toEqual({
      label: 'Database',
      value: '',
    });
  });
});

// ─── gcp.redis.instance ────────────────────────────────────────────────────

describe('primaryOutput — gcp.redis.instance', () => {
  it('returns host:port when port is present', () => {
    expect(primaryOutput('gcp.redis.instance', { host: '10.0.0.1', port: 6379 }, 'pid')).toEqual({
      label: 'Redis',
      value: '10.0.0.1:6379',
    });
  });

  it('returns host alone when port is missing or empty', () => {
    expect(primaryOutput('gcp.redis.instance', { host: '10.0.0.1' }, 'pid')).toEqual({
      label: 'Redis',
      value: '10.0.0.1',
    });
  });

  it('falls back to outputs.ip_address when host is missing', () => {
    expect(primaryOutput('gcp.redis.instance', { ip_address: '10.0.0.2' }, 'pid')).toEqual({
      label: 'Redis',
      value: '10.0.0.2',
    });
  });

  it('returns null when both host and ip_address are missing', () => {
    expect(primaryOutput('gcp.redis.instance', {}, 'pid')).toBeNull();
  });

  it('accepts string port', () => {
    expect(primaryOutput('gcp.redis.instance', { host: '10.0.0.3', port: '6380' }, 'pid')).toEqual({
      label: 'Redis',
      value: '10.0.0.3:6380',
    });
  });
});

// ─── gcp.pubsub.topic / gcp.secretmanager.secret ───────────────────────────

describe('primaryOutput — gcp.pubsub.topic', () => {
  it('uses outputs.name', () => {
    expect(primaryOutput('gcp.pubsub.topic', { name: 't' }, 'pid')).toEqual({
      label: 'Topic',
      value: 't',
    });
  });

  it('falls back to providerId, then empty string', () => {
    expect(primaryOutput('gcp.pubsub.topic', {}, 'pid')).toEqual({ label: 'Topic', value: 'pid' });
    expect(primaryOutput('gcp.pubsub.topic', {}, undefined)).toEqual({
      label: 'Topic',
      value: '',
    });
  });
});

describe('primaryOutput — gcp.secretmanager.secret', () => {
  it('uses outputs.name', () => {
    expect(primaryOutput('gcp.secretmanager.secret', { name: 's' }, 'pid')).toEqual({
      label: 'Secret',
      value: 's',
    });
  });

  it('falls back to providerId, then empty string', () => {
    expect(primaryOutput('gcp.secretmanager.secret', {}, 'pid')).toEqual({
      label: 'Secret',
      value: 'pid',
    });
    expect(primaryOutput('gcp.secretmanager.secret', {}, undefined)).toEqual({
      label: 'Secret',
      value: '',
    });
  });
});

// ─── gcp.apigateway.api ────────────────────────────────────────────────────

describe('primaryOutput — gcp.apigateway.api', () => {
  it('uses outputs.default_hostname when present and prefixes https://', () => {
    expect(primaryOutput('gcp.apigateway.api', { default_hostname: 'gw.example.com' }, 'pid')).toEqual({
      label: 'API',
      value: 'gw.example.com',
      url: 'https://gw.example.com',
    });
  });

  it('falls back to outputs.url and preserves the http(s) prefix', () => {
    expect(primaryOutput('gcp.apigateway.api', { url: 'http://gw.example.com' }, 'pid')).toEqual({
      label: 'API',
      value: 'http://gw.example.com',
      url: 'http://gw.example.com',
    });
  });

  it('preserves a fully-qualified https:// url', () => {
    expect(primaryOutput('gcp.apigateway.api', { url: 'https://gw.example.com' }, 'pid')).toEqual({
      label: 'API',
      value: 'https://gw.example.com',
      url: 'https://gw.example.com',
    });
  });

  it('returns null when neither default_hostname nor url is present', () => {
    expect(primaryOutput('gcp.apigateway.api', {}, 'pid')).toBeNull();
  });
});

// ─── gcp.container.cluster ─────────────────────────────────────────────────

describe('primaryOutput — gcp.container.cluster', () => {
  it('returns K8s row with outputs.endpoint', () => {
    expect(primaryOutput('gcp.container.cluster', { endpoint: '10.0.0.5' }, 'pid')).toEqual({
      label: 'K8s',
      value: '10.0.0.5',
    });
  });

  it('returns null when endpoint is missing', () => {
    expect(primaryOutput('gcp.container.cluster', {}, 'pid')).toBeNull();
  });
});

// ─── gcp.firebase.hosting ──────────────────────────────────────────────────

describe('primaryOutput — gcp.firebase.hosting', () => {
  it('prefers custom_domain_url with "Custom Domain" label', () => {
    expect(
      primaryOutput(
        'gcp.firebase.hosting',
        { custom_domain_url: 'https://x.example.com', default_url: 'https://y.web.app', url: 'https://z' },
        'pid',
      ),
    ).toEqual({
      label: 'Custom Domain',
      value: 'https://x.example.com',
      url: 'https://x.example.com',
    });
  });

  it('falls back to default_url when no custom domain', () => {
    expect(primaryOutput('gcp.firebase.hosting', { default_url: 'https://y.web.app' }, 'pid')).toEqual({
      label: 'URL',
      value: 'https://y.web.app',
      url: 'https://y.web.app',
    });
  });

  it('falls back to url when no custom_domain_url and no default_url', () => {
    expect(primaryOutput('gcp.firebase.hosting', { url: 'https://z' }, 'pid')).toEqual({
      label: 'URL',
      value: 'https://z',
      url: 'https://z',
    });
  });

  it('returns null when no URL fields are populated', () => {
    expect(primaryOutput('gcp.firebase.hosting', {}, 'pid')).toBeNull();
  });
});

// ─── gcpConsoleUrl ─────────────────────────────────────────────────────────

describe('gcpConsoleUrl (early returns)', () => {
  it('returns null when resourceType is missing', () => {
    expect(gcpConsoleUrl(undefined, 'pid', 'prj')).toBeNull();
  });

  it('returns null when providerId is missing', () => {
    expect(gcpConsoleUrl('gcp.storage.bucket', undefined, 'prj')).toBeNull();
  });

  it('returns null when project is missing', () => {
    expect(gcpConsoleUrl('gcp.storage.bucket', 'pid', undefined)).toBeNull();
  });

  it('returns null when project is empty string', () => {
    expect(gcpConsoleUrl('gcp.storage.bucket', 'pid', '')).toBeNull();
  });

  it('returns null when providerId is empty string', () => {
    expect(gcpConsoleUrl('gcp.storage.bucket', '', 'prj')).toBeNull();
  });

  it('returns null when resourceType is empty string', () => {
    expect(gcpConsoleUrl('', 'pid', 'prj')).toBeNull();
  });
});

describe('gcpConsoleUrl — per-resource deep-link mapping', () => {
  it.each<[string, string]>([
    ['gcp.storage.bucket', 'https://console.cloud.google.com/storage/browser/the-id?project=the-prj'],
    ['gcp.run.service', 'https://console.cloud.google.com/run?project=the-prj'],
    ['gcp.run.job', 'https://console.cloud.google.com/run/jobs?project=the-prj'],
    ['gcp.cloudfunctions.function', 'https://console.cloud.google.com/functions/list?project=the-prj'],
    ['gcp.sql.databaseInstance', 'https://console.cloud.google.com/sql/instances?project=the-prj'],
    ['gcp.firestore.database', 'https://console.cloud.google.com/firestore/data?project=the-prj'],
    ['gcp.redis.instance', 'https://console.cloud.google.com/memorystore/redis/instances?project=the-prj'],
    ['gcp.pubsub.topic', 'https://console.cloud.google.com/cloudpubsub/topic/list?project=the-prj'],
    ['gcp.pubsub.subscription', 'https://console.cloud.google.com/cloudpubsub/subscription/list?project=the-prj'],
    ['gcp.secretmanager.secret', 'https://console.cloud.google.com/security/secret-manager?project=the-prj'],
    ['gcp.apigateway.api', 'https://console.cloud.google.com/api-gateway/apis?project=the-prj'],
    ['gcp.container.cluster', 'https://console.cloud.google.com/kubernetes/list/overview?project=the-prj'],
    ['gcp.bigquery.dataset', 'https://console.cloud.google.com/bigquery?project=the-prj'],
    ['gcp.logging.sink', 'https://console.cloud.google.com/logs/router?project=the-prj'],
  ])('returns the canonical URL for %s', (resourceType, expected) => {
    expect(gcpConsoleUrl(resourceType, 'the-id', 'the-prj')).toBe(expected);
  });

  it.each<string>([
    'gcp.compute.globalForwardingRule',
    'gcp.compute.backendBucket',
    'gcp.compute.backendService',
    'gcp.compute.urlMap',
    'gcp.compute.targetHttpsProxy',
    'gcp.compute.targetHttpProxy',
  ])('all load-balancer subtypes share the loadBalancers URL: %s', (resourceType) => {
    expect(gcpConsoleUrl(resourceType, 'id', 'prj')).toBe(
      'https://console.cloud.google.com/net-services/loadbalancing/list/loadBalancers?project=prj',
    );
  });

  it('uses dedicated URL for managedSslCertificate (NOT the load-balancer URL)', () => {
    expect(gcpConsoleUrl('gcp.compute.managedSslCertificate', 'id', 'prj')).toBe(
      'https://console.cloud.google.com/security/ccm/list/lbCertificates?project=prj',
    );
  });

  it('encodes special characters in providerId AND project for storage.bucket', () => {
    expect(gcpConsoleUrl('gcp.storage.bucket', 'pid with space', 'prj/special')).toBe(
      'https://console.cloud.google.com/storage/browser/pid%20with%20space?project=prj%2Fspecial',
    );
  });

  it('strips firebase://sites/ prefix for firebase.hosting deep-links', () => {
    expect(gcpConsoleUrl('gcp.firebase.hosting', 'firebase://sites/my-site', 'prj')).toBe(
      'https://console.firebase.google.com/project/prj/hosting/sites/my-site',
    );
  });

  it('preserves providerId as siteId when no firebase://sites/ prefix is present', () => {
    expect(gcpConsoleUrl('gcp.firebase.hosting', 'bare-site-id', 'prj')).toBe(
      'https://console.firebase.google.com/project/prj/hosting/sites/bare-site-id',
    );
  });

  it('encodes the firebase site id', () => {
    expect(gcpConsoleUrl('gcp.firebase.hosting', 'firebase://sites/site/with/slashes', 'prj')).toBe(
      'https://console.firebase.google.com/project/prj/hosting/sites/site%2Fwith%2Fslashes',
    );
  });

  it('falls back to empty siteId when providerId is exactly the firebase://sites/ prefix', () => {
    // Pin the `|| ''` fallback when `replace` strips the entire string —
    // verifies the rhs of the OR-default is observable.
    expect(gcpConsoleUrl('gcp.firebase.hosting', 'firebase://sites/', 'prj')).toBe(
      'https://console.firebase.google.com/project/prj/hosting/sites/',
    );
  });

  it('returns null for unknown resource types', () => {
    expect(gcpConsoleUrl('aws.lambda.function', 'id', 'prj')).toBeNull();
    expect(gcpConsoleUrl('something.unmapped', 'id', 'prj')).toBeNull();
  });
});
