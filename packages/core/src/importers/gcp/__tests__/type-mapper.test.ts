/**
 * Tests for GCP type-mapper.ts.
 *
 * Pure module — exercises every entry in KIND_MAP, every entry in
 * FALLBACK_KIND_MAP, every CLEAN_PROPERTY_EXTRACTORS branch, and the
 * snake_case fallback in map_properties + low-level kind splitter in
 * get_ice_type.
 */

import { describe, it, expect } from 'vitest';
import {
  get_ice_type,
  get_behavior,
  get_type_info,
  is_kind_supported,
  get_supported_kinds,
  map_properties,
} from '../type-mapper.js';

// ===========================================================================
// get_ice_type — high-level KIND_MAP coverage
// ===========================================================================

describe('get_ice_type — networking kinds', () => {
  it('maps compute#network to Network.VPC', () => {
    expect(get_ice_type('compute#network')).toBe('Network.VPC');
  });
  it('maps compute#subnetwork to Network.Subnet', () => {
    expect(get_ice_type('compute#subnetwork')).toBe('Network.Subnet');
  });
  it('maps compute#forwardingrule to Network.LoadBalancer', () => {
    expect(get_ice_type('compute#forwardingrule')).toBe('Network.LoadBalancer');
  });
  it('maps compute#globalforwardingrule to Network.CDN', () => {
    expect(get_ice_type('compute#globalforwardingrule')).toBe('Network.CDN');
  });
  it('maps compute#urlmap to Network.LoadBalancer', () => {
    expect(get_ice_type('compute#urlmap')).toBe('Network.LoadBalancer');
  });
  it('maps compute#backendservice to Network.LoadBalancer', () => {
    expect(get_ice_type('compute#backendservice')).toBe('Network.LoadBalancer');
  });
  it('maps dns#managedzone to Network.DNS', () => {
    expect(get_ice_type('dns#managedzone')).toBe('Network.DNS');
  });
  it('maps apigateway#gateway to Compute.API', () => {
    expect(get_ice_type('apigateway#gateway')).toBe('Compute.API');
  });
});

describe('get_ice_type — application/compute kinds', () => {
  it('maps run#service to Compute.Container', () => {
    expect(get_ice_type('run#service')).toBe('Compute.Container');
  });
  it('maps run#job to Compute.Worker', () => {
    expect(get_ice_type('run#job')).toBe('Compute.Worker');
  });
  it('maps cloudfunctions#function to Compute.Function', () => {
    expect(get_ice_type('cloudfunctions#function')).toBe('Compute.Function');
  });
  it('maps cloudfunctions#cloudfunction to Compute.Function', () => {
    expect(get_ice_type('cloudfunctions#cloudfunction')).toBe('Compute.Function');
  });
  it('maps appengine#service to Compute.Container', () => {
    expect(get_ice_type('appengine#service')).toBe('Compute.Container');
  });
  it('maps container#cluster to Compute.Container', () => {
    expect(get_ice_type('container#cluster')).toBe('Compute.Container');
  });
  it('maps compute#instance to Compute.Container', () => {
    expect(get_ice_type('compute#instance')).toBe('Compute.Container');
  });
  it('maps compute#instancegroup to Compute.Container', () => {
    expect(get_ice_type('compute#instancegroup')).toBe('Compute.Container');
  });
});

describe('get_ice_type — database kinds', () => {
  it('maps sqladmin#instance to Database.PostgreSQL', () => {
    expect(get_ice_type('sqladmin#instance')).toBe('Database.PostgreSQL');
  });
  it('maps sql#instance to Database.PostgreSQL', () => {
    expect(get_ice_type('sql#instance')).toBe('Database.PostgreSQL');
  });
  it('maps spanner#instance to Database.PostgreSQL', () => {
    expect(get_ice_type('spanner#instance')).toBe('Database.PostgreSQL');
  });
  it('maps redis#instance to Database.Redis', () => {
    expect(get_ice_type('redis#instance')).toBe('Database.Redis');
  });
  it('maps firestore#database to Database.NoSQL', () => {
    expect(get_ice_type('firestore#database')).toBe('Database.NoSQL');
  });
  it('maps bigquery#dataset to Database.DataWarehouse', () => {
    expect(get_ice_type('bigquery#dataset')).toBe('Database.DataWarehouse');
  });
});

describe('get_ice_type — storage / messaging / security / monitoring', () => {
  it('maps storage#bucket to Storage.Bucket', () => {
    expect(get_ice_type('storage#bucket')).toBe('Storage.Bucket');
  });
  it('maps filestore#instance to Storage.FileSystem', () => {
    expect(get_ice_type('filestore#instance')).toBe('Storage.FileSystem');
  });
  it('maps pubsub#topic to Messaging.EventBus', () => {
    expect(get_ice_type('pubsub#topic')).toBe('Messaging.EventBus');
  });
  it('maps pubsub#subscription to Messaging.Queue', () => {
    expect(get_ice_type('pubsub#subscription')).toBe('Messaging.Queue');
  });
  it('maps cloudtasks#queue to Messaging.Queue', () => {
    expect(get_ice_type('cloudtasks#queue')).toBe('Messaging.Queue');
  });
  it('maps secretmanager#secret to Security.Secret', () => {
    expect(get_ice_type('secretmanager#secret')).toBe('Security.Secret');
  });
  it('maps iam#serviceaccount to Security.Identity', () => {
    expect(get_ice_type('iam#serviceaccount')).toBe('Security.Identity');
  });
  it('maps compute#sslcertificate to Security.Certificate', () => {
    expect(get_ice_type('compute#sslcertificate')).toBe('Security.Certificate');
  });
  it('maps cloudkms#keyring to Security.Key', () => {
    expect(get_ice_type('cloudkms#keyring')).toBe('Security.Key');
  });
  it('maps cloudkms#cryptokey to Security.Key', () => {
    expect(get_ice_type('cloudkms#cryptokey')).toBe('Security.Key');
  });
  it('maps logging#logsink to Monitoring.LogGroup', () => {
    expect(get_ice_type('logging#logsink')).toBe('Monitoring.LogGroup');
  });
  it('maps monitoring#alertpolicy to Monitoring.Alert', () => {
    expect(get_ice_type('monitoring#alertpolicy')).toBe('Monitoring.Alert');
  });
  it('maps monitoring#dashboard to Monitoring.Dashboard', () => {
    expect(get_ice_type('monitoring#dashboard')).toBe('Monitoring.Dashboard');
  });
  it('maps cloudscheduler#job to Compute.CronJob', () => {
    expect(get_ice_type('cloudscheduler#job')).toBe('Compute.CronJob');
  });
});

// ===========================================================================
// get_ice_type — fallback paths
// ===========================================================================

describe('get_ice_type — fallback low-level mapping', () => {
  it('returns fallback gcp.compute.disk for compute#disk', () => {
    expect(get_ice_type('compute#disk')).toBe('gcp.compute.disk');
  });
  it('returns fallback for compute#firewall', () => {
    expect(get_ice_type('compute#firewall')).toBe('gcp.compute.firewall');
  });
  it('returns fallback for sql#database', () => {
    expect(get_ice_type('sql#database')).toBe('gcp.sql.database');
  });
  it('returns fallback for sqladmin#database', () => {
    expect(get_ice_type('sqladmin#database')).toBe('gcp.sql.database');
  });
  it('returns fallback for run#revision', () => {
    expect(get_ice_type('run#revision')).toBe('gcp.run.revision');
  });
});

describe('get_ice_type — generated low-level type for unknown two-part kinds', () => {
  it('synthesizes gcp.<service>.<resource> from compute#unknownThing', () => {
    expect(get_ice_type('compute#unknownThing')).toBe('gcp.compute.unknownthing');
  });
  it('lowercases the service segment', () => {
    expect(get_ice_type('CUSTOM#widget')).toBe('gcp.custom.widget');
  });
});

describe('get_ice_type — last-resort unknown kind', () => {
  it('returns gcp.unknown.<kind> for kinds without a # separator', () => {
    expect(get_ice_type('weirdkind')).toBe('gcp.unknown.weirdkind');
  });
  it('handles kinds with too many segments via the unknown bucket', () => {
    // 3 parts → does not match `parts.length === 2`, falls to gcp.unknown.<...>
    expect(get_ice_type('a#b#c')).toBe('gcp.unknown.a_b#c');
  });
});

// ===========================================================================
// get_behavior + get_type_info + is_kind_supported + get_supported_kinds
// ===========================================================================

describe('get_behavior', () => {
  it('returns the mapped behavior for a known kind', () => {
    expect(get_behavior('compute#network')).toBe('container');
    expect(get_behavior('run#service')).toBe('scalable');
    expect(get_behavior('storage#bucket')).toBe('stateful');
    expect(get_behavior('pubsub#topic')).toBe('streaming');
    expect(get_behavior('iam#serviceaccount')).toBe('singleton');
    expect(get_behavior('compute#forwardingrule')).toBe('connector');
  });
  it('returns undefined for an unmapped kind', () => {
    expect(get_behavior('compute#disk')).toBeUndefined();
    expect(get_behavior('totally-unknown')).toBeUndefined();
  });
});

describe('get_type_info', () => {
  it('returns ice_type and behavior for mapped kinds', () => {
    expect(get_type_info('compute#instance')).toEqual({
      ice_type: 'Compute.Container',
      behavior: 'scalable',
    });
  });
  it('returns ice_type with undefined behavior for unmapped kinds', () => {
    const info = get_type_info('compute#disk');
    expect(info.ice_type).toBe('gcp.compute.disk');
    expect(info.behavior).toBeUndefined();
  });
});

describe('is_kind_supported', () => {
  it('is true for kinds in the high-level map', () => {
    expect(is_kind_supported('compute#network')).toBe(true);
  });
  it('is false for kinds only in the fallback map', () => {
    expect(is_kind_supported('compute#disk')).toBe(false);
  });
  it('is false for completely unknown kinds', () => {
    expect(is_kind_supported('foo#bar')).toBe(false);
  });
});

describe('get_supported_kinds', () => {
  it('returns a list including each major category', () => {
    const kinds = get_supported_kinds();
    expect(kinds).toContain('compute#network');
    expect(kinds).toContain('storage#bucket');
    expect(kinds).toContain('pubsub#topic');
    expect(kinds).toContain('cloudscheduler#job');
  });
  it('does not include fallback-only kinds', () => {
    expect(get_supported_kinds()).not.toContain('compute#disk');
  });
});

// ===========================================================================
// map_properties — every CLEAN_PROPERTY_EXTRACTORS entry
// ===========================================================================

describe('map_properties — compute#network extractor', () => {
  it('extracts auto_create + routing_mode + mtu', () => {
    const out = map_properties('compute#network', {
      name: 'vpc-1',
      autoCreateSubnetworks: true,
      routingConfig: { routingMode: 'GLOBAL' },
      mtu: 1500,
    });
    expect(out).toEqual({
      name: 'vpc-1',
      auto_create_subnetworks: true,
      routing_mode: 'GLOBAL',
      mtu: 1500,
    });
  });
  it('omits undefined fields when routingConfig is missing', () => {
    const out = map_properties('compute#network', { name: 'vpc-2' });
    expect(out).toEqual({ name: 'vpc-2' });
    expect(out).not.toHaveProperty('routing_mode');
  });
});

describe('map_properties — compute#subnetwork extractor', () => {
  it('extracts cidr, region from URL, and secondary range CIDRs', () => {
    const out = map_properties('compute#subnetwork', {
      name: 'sub-1',
      ipCidrRange: '10.0.0.0/24',
      region: 'https://www.googleapis.com/compute/v1/projects/p/regions/us-central1',
      privateIpGoogleAccess: true,
      secondaryIpRanges: [{ ipCidrRange: '10.1.0.0/24' }, { ipCidrRange: '10.2.0.0/24' }],
    });
    expect(out).toEqual({
      name: 'sub-1',
      cidr_block: '10.0.0.0/24',
      region: 'us-central1',
      private_ip_google_access: true,
      secondary_ip_ranges: ['10.1.0.0/24', '10.2.0.0/24'],
    });
  });
  it('returns undefined region when the region URL has no /regions/ segment', () => {
    const out = map_properties('compute#subnetwork', {
      name: 'sub-2',
      ipCidrRange: '10.0.0.0/24',
      region: 'global',
    });
    expect(out).not.toHaveProperty('region');
  });
  it('omits region when no region prop is supplied (extractRegion(undefined))', () => {
    const out = map_properties('compute#subnetwork', { name: 'sub-3' });
    expect(out).toEqual({ name: 'sub-3' });
  });
});

describe('map_properties — run#service extractor', () => {
  it('reads container fields from template.containers[0]', () => {
    const out = map_properties('run#service', {
      name: 'svc',
      template: {
        containers: [
          {
            image: 'gcr.io/p/img:1',
            ports: [{ containerPort: 8080 }],
            resources: { limits: { memory: '512Mi', cpu: '1' } },
          },
        ],
        maxInstanceRequestConcurrency: 80,
        scaling: { minInstanceCount: 1, maxInstanceCount: 10 },
      },
    });
    expect(out).toEqual({
      name: 'svc',
      image: 'gcr.io/p/img:1',
      port: 8080,
      memory: '512Mi',
      cpu: '1',
      concurrency: 80,
      min_instances: 1,
      max_instances: 10,
    });
  });
  it('falls back to template.spec.containers when present', () => {
    const out = map_properties('run#service', {
      name: 'svc',
      template: { spec: { containers: [{ image: 'gcr.io/p/img:2' }] } },
    });
    expect(out).toEqual({ name: 'svc', image: 'gcr.io/p/img:2' });
  });
  it('uses metadata.name when top-level name is missing', () => {
    const out = map_properties('run#service', {
      template: {},
      metadata: { name: 'svc-meta' },
    });
    expect(out).toEqual({ name: 'svc-meta' });
  });
  it('handles a missing template gracefully', () => {
    const out = map_properties('run#service', { name: 'svc' });
    // template defaults to {}, no containers, all child reads return undefined
    expect(out).toEqual({ name: 'svc' });
  });
});

describe('map_properties — cloudfunctions extractors', () => {
  const fnProps = {
    name: 'fn',
    runtime: 'nodejs20',
    entryPoint: 'main',
    availableMemoryMb: 256,
    timeout: '60s',
  };
  it('reports HTTP trigger when httpsTrigger is present', () => {
    expect(map_properties('cloudfunctions#function', { ...fnProps, httpsTrigger: {} })).toMatchObject({
      trigger: 'HTTP',
    });
  });
  it('reports Event trigger when eventTrigger is present (function variant)', () => {
    expect(map_properties('cloudfunctions#function', { ...fnProps, eventTrigger: {} })).toMatchObject({
      trigger: 'Event',
    });
  });
  it('reports Unknown when no trigger is provided', () => {
    expect(map_properties('cloudfunctions#function', fnProps)).toMatchObject({ trigger: 'Unknown' });
  });
  it('cloudfunction (singular) variant maps the same fields and HTTP branch', () => {
    expect(
      map_properties('cloudfunctions#cloudfunction', { ...fnProps, httpsTrigger: {} }),
    ).toMatchObject({ trigger: 'HTTP' });
  });
  it('cloudfunction Event branch', () => {
    expect(
      map_properties('cloudfunctions#cloudfunction', { ...fnProps, eventTrigger: {} }),
    ).toMatchObject({ trigger: 'Event' });
  });
  it('cloudfunction Unknown branch', () => {
    expect(map_properties('cloudfunctions#cloudfunction', fnProps)).toMatchObject({ trigger: 'Unknown' });
  });
});

describe('map_properties — sqladmin#instance extractor', () => {
  it('extracts settings + reports REGIONAL HA', () => {
    const out = map_properties('sqladmin#instance', {
      name: 'db',
      databaseVersion: 'POSTGRES_15',
      settings: {
        tier: 'db-f1-micro',
        dataDiskSizeGb: 10,
        dataDiskType: 'PD_SSD',
        availabilityType: 'REGIONAL',
        backupConfiguration: { enabled: true },
      },
    });
    expect(out).toEqual({
      name: 'db',
      version: 'POSTGRES_15',
      tier: 'db-f1-micro',
      storage_gb: 10,
      storage_type: 'PD_SSD',
      high_availability: true,
      backup_enabled: true,
    });
  });
  it('reports high_availability=false when availabilityType is not REGIONAL', () => {
    const out = map_properties('sqladmin#instance', {
      name: 'db',
      settings: { availabilityType: 'ZONAL' },
    });
    expect(out).toMatchObject({ high_availability: false });
  });
  it('handles missing settings without throwing', () => {
    expect(() => map_properties('sqladmin#instance', { name: 'db' })).not.toThrow();
  });
});

describe('map_properties — sql#instance reuses sqladmin extractor', () => {
  it('returns the same shape via aliasing', () => {
    const out = map_properties('sql#instance', {
      name: 'db',
      databaseVersion: 'POSTGRES_14',
      settings: { tier: 't', dataDiskSizeGb: 5 },
    });
    expect(out).toMatchObject({ name: 'db', version: 'POSTGRES_14', tier: 't', storage_gb: 5 });
  });
});

describe('map_properties — storage#bucket extractor', () => {
  it('flips public_access based on iamConfiguration.uniformBucketLevelAccess.enabled', () => {
    const out = map_properties('storage#bucket', {
      name: 'b1',
      location: 'US',
      storageClass: 'STANDARD',
      versioning: { enabled: true },
      iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
      lifecycle: { rule: [{ condition: { age: 30 } }] },
    });
    expect(out).toEqual({
      name: 'b1',
      location: 'US',
      storage_class: 'STANDARD',
      versioning: true,
      public_access: false,
      lifecycle_days: 30,
    });
  });
  it('treats missing iamConfiguration as public_access=true', () => {
    const out = map_properties('storage#bucket', { name: 'b2', location: 'US' });
    expect(out.public_access).toBe(true);
  });
});

describe('map_properties — pubsub#topic and pubsub#subscription extractors', () => {
  it('topic returns name and message_retention', () => {
    const out = map_properties('pubsub#topic', { name: 'projects/p/topics/t1', messageRetentionDuration: '600s' });
    expect(out).toEqual({ name: 'projects/p/topics/t1', message_retention: '600s' });
  });
  it('topic falls through to extractName(undefined) when name is absent', () => {
    // props.name is undefined, so `props.name || extractName(...)` evaluates the right
    // side, which calls extractName(undefined) → returns undefined.
    const out = map_properties('pubsub#topic', { messageRetentionDuration: '60s' });
    expect(out).toEqual({ message_retention: '60s' });
  });
  it('subscription extracts topic by trailing path segment + push_endpoint', () => {
    const out = map_properties('pubsub#subscription', {
      name: 'projects/p/subscriptions/s1',
      topic: 'projects/p/topics/t1',
      ackDeadlineSeconds: 30,
      messageRetentionDuration: '7d',
      pushConfig: { pushEndpoint: 'https://h/push' },
    });
    expect(out).toEqual({
      name: 'projects/p/subscriptions/s1',
      topic: 't1',
      ack_deadline: 30,
      message_retention: '7d',
      push_endpoint: 'https://h/push',
    });
  });
  it('subscription handles topic="" (extractName returns "")', () => {
    const out = map_properties('pubsub#subscription', { name: 's', ackDeadlineSeconds: 10 });
    // extractName('') returns '' which is falsy → branch covered
    expect(out).toMatchObject({ name: 's', ack_deadline: 10 });
  });
  it('subscription falls through to extractName when name is absent', () => {
    const out = map_properties('pubsub#subscription', { ackDeadlineSeconds: 10 });
    // No name + extractName(undefined) returns undefined → filtered out
    expect(out).toEqual({ ack_deadline: 10 });
  });
});

describe('map_properties — secret manager extractor', () => {
  it('reports automatic vs manual replication', () => {
    expect(map_properties('secretmanager#secret', { name: 'projects/p/secrets/s', replication: { automatic: {} } })).toEqual({
      name: 'projects/p/secrets/s',
      replication: 'automatic',
    });
    expect(map_properties('secretmanager#secret', { name: 'projects/p/secrets/s', replication: {} })).toEqual({
      name: 'projects/p/secrets/s',
      replication: 'manual',
    });
  });
  it('falls through to extractName when name is missing', () => {
    const out = map_properties('secretmanager#secret', { replication: { automatic: {} } });
    // extractName falls through (path = '' is falsy in extractName guard) → undefined → filtered out.
    expect(out).toEqual({ replication: 'automatic' });
  });
});

describe('map_properties — redis / gke / dns / iam / cloudscheduler / monitoring / bigquery extractors', () => {
  it('redis#instance', () => {
    expect(
      map_properties('redis#instance', {
        name: 'r1',
        tier: 'BASIC',
        memorySizeGb: 1,
        redisVersion: 'REDIS_7_0',
        host: '10.0.0.1',
        port: 6379,
      }),
    ).toEqual({
      name: 'r1',
      tier: 'BASIC',
      memory_size_gb: 1,
      version: 'REDIS_7_0',
      host: '10.0.0.1',
      port: 6379,
    });
  });
  it('container#cluster prefers currentNodeCount over initialNodeCount', () => {
    const out = map_properties('container#cluster', {
      name: 'c1',
      location: 'us-central1',
      currentNodeCount: 5,
      initialNodeCount: 1,
      nodeConfig: { machineType: 'e2-medium' },
      currentMasterVersion: '1.30',
      network: 'projects/p/global/networks/default',
    });
    expect(out).toEqual({
      name: 'c1',
      location: 'us-central1',
      node_count: 5,
      machine_type: 'e2-medium',
      kubernetes_version: '1.30',
      network: 'default',
    });
  });
  it('container#cluster falls back to initialNodeCount when currentNodeCount missing', () => {
    const out = map_properties('container#cluster', { name: 'c2', initialNodeCount: 2 });
    expect(out).toMatchObject({ node_count: 2 });
  });
  it('dns#managedzone', () => {
    expect(
      map_properties('dns#managedzone', { name: 'z', dnsName: 'example.com.', visibility: 'public' }),
    ).toEqual({ name: 'z', dns_name: 'example.com.', visibility: 'public' });
  });
  it('iam#serviceaccount prefers displayName over name', () => {
    const out = map_properties('iam#serviceaccount', {
      displayName: 'My SA',
      name: 'sa@x.iam',
      email: 'sa@x.iam.gserviceaccount.com',
      description: 'desc',
    });
    expect(out).toEqual({ name: 'My SA', email: 'sa@x.iam.gserviceaccount.com', description: 'desc' });
  });
  it('iam#serviceaccount falls back to name when displayName missing', () => {
    const out = map_properties('iam#serviceaccount', { name: 'sa', email: 'sa@x' });
    expect(out).toMatchObject({ name: 'sa' });
  });
  it('cloudscheduler#job — HTTP target', () => {
    expect(
      map_properties('cloudscheduler#job', { name: 'j', schedule: '* * * * *', timeZone: 'UTC', httpTarget: {} }),
    ).toMatchObject({ target_type: 'HTTP' });
  });
  it('cloudscheduler#job — Pub/Sub target', () => {
    expect(map_properties('cloudscheduler#job', { name: 'j', pubsubTarget: {} })).toMatchObject({
      target_type: 'Pub/Sub',
    });
  });
  it('cloudscheduler#job — Unknown target', () => {
    expect(map_properties('cloudscheduler#job', { name: 'j' })).toMatchObject({ target_type: 'Unknown' });
  });
  it('monitoring#alertpolicy reports condition count and falls back to name when displayName missing', () => {
    expect(
      map_properties('monitoring#alertpolicy', {
        displayName: 'd',
        enabled: true,
        conditions: [{}, {}, {}],
      }),
    ).toEqual({ name: 'd', enabled: true, conditions: 3 });
    expect(map_properties('monitoring#alertpolicy', { name: 'n', enabled: false })).toMatchObject({
      name: 'n',
      conditions: 0,
    });
  });
  it('bigquery#dataset prefers datasetReference.datasetId over friendlyName', () => {
    expect(
      map_properties('bigquery#dataset', {
        datasetReference: { datasetId: 'my_ds' },
        friendlyName: 'fn',
        location: 'US',
        description: 'd',
      }),
    ).toEqual({ name: 'my_ds', location: 'US', description: 'd' });
    // fall back to friendlyName
    expect(
      map_properties('bigquery#dataset', { datasetReference: {}, friendlyName: 'only' }),
    ).toMatchObject({ name: 'only' });
  });
});

// ===========================================================================
// map_properties — fallback snake_case path
// ===========================================================================

describe('map_properties — fallback snake_case conversion for unknown kinds', () => {
  it('skips internal fields (_, kind, etag, selfLink) and converts camelCase to snake_case', () => {
    const out = map_properties('something#unknown', {
      _internal: 'x',
      kind: 'k',
      etag: 'e',
      selfLink: 'sl',
      camelKey: 'v',
      AnotherOne: 'w',
    });
    expect(out).toEqual({ camel_key: 'v', another_one: 'w' });
  });
  it('drops a leading underscore on the converted snake_case key', () => {
    const out = map_properties('something#unknown', { CapitalThing: 1 });
    expect(out).toEqual({ capital_thing: 1 });
  });
  it('returns an empty object when only internal fields are present', () => {
    const out = map_properties('something#unknown', { kind: 'k', etag: 'e' });
    expect(out).toEqual({});
  });
});
