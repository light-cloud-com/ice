/**
 * Tests for `extractors/dispatch.ts` — the PROPERTY_EXTRACTORS table that
 * maps each resolved GCP resource type (e.g. `gcp.run.service`) to a
 * property extractor function used by the card-to-graph translator.
 *
 * Coverage focuses on:
 *   - Shape: 27 entries, every key matches `gcp.{service}.{kind}`, every
 *     value is a function, type signature accepts the optional `node_id`
 *     third argument (load-bearing for `extract_subnet_properties`).
 *   - Identity: spot-check 3+ keys via reference equality so refactors
 *     that accidentally swap two extractors fail loudly.
 *   - The only "two keys → same fn" case in the table:
 *     `gcp.aiplatform.endpoint` and `gcp.aiplatform.index` both alias to
 *     `extract_vertex_ai_properties`. Pinned explicitly because a future
 *     edit could split them and break vertex-ai routing silently.
 *   - Lookup miss: an unknown key returns `undefined` so the orchestrator's
 *     `if (extractor)` gate fires the `Register an extractor in
 *     PROPERTY_EXTRACTORS …` error path instead of dropping config.
 */
import { describe, it, expect } from 'vitest';
import { PROPERTY_EXTRACTORS } from '../dispatch';
import {
  extract_cloud_run_properties,
  extract_cloud_run_job_properties,
  extract_cloud_functions_properties,
  extract_cloud_scheduler_properties,
} from '../compute';
import {
  extract_cloud_sql_properties,
  extract_firestore_properties,
  extract_memorystore_properties,
} from '../database';
import {
  extract_storage_bucket_properties,
  extract_pubsub_properties,
  extract_api_gateway_properties,
  extract_load_balancer_properties,
  extract_vpc_properties,
  extract_subnet_properties,
  extract_cloud_armor_properties,
} from '../network';
import {
  extract_secret_manager_properties,
  extract_identity_platform_properties,
  extract_bigquery_properties,
  extract_logging_properties,
  extract_vertex_ai_properties,
  extract_dataflow_properties,
  extract_discovery_engine_properties,
  extract_gke_properties,
  extract_domain_mapping_properties,
  extract_custom_domain_properties,
  extract_backend_bucket_properties,
  extract_firebase_hosting_properties,
} from '../ancillary';

describe('PROPERTY_EXTRACTORS table shape', () => {
  it('has exactly 27 entries (matches the 27 resolved GCP types the deployer supports)', () => {
    expect(Object.keys(PROPERTY_EXTRACTORS)).toHaveLength(27);
  });

  it('every key matches the gcp.{service}.{kind} shape', () => {
    const pattern = /^gcp\.[a-z]+\.[a-zA-Z]+$/;
    for (const key of Object.keys(PROPERTY_EXTRACTORS)) {
      expect(key, `key "${key}" should be gcp.{service}.{kind}`).toMatch(pattern);
    }
  });

  it('every value is a function', () => {
    for (const [key, value] of Object.entries(PROPERTY_EXTRACTORS)) {
      expect(typeof value, `value at "${key}" should be a function`).toBe('function');
    }
  });

  it('returns undefined for an unknown key (orchestrator falls through to the error path)', () => {
    expect(PROPERTY_EXTRACTORS['gcp.unknown.thing']).toBeUndefined();
    expect(PROPERTY_EXTRACTORS['']).toBeUndefined();
    expect(PROPERTY_EXTRACTORS['aws.s3.bucket']).toBeUndefined();
  });
});

describe('PROPERTY_EXTRACTORS identity (reference equality)', () => {
  it('routes gcp.run.service to extract_cloud_run_properties', () => {
    expect(PROPERTY_EXTRACTORS['gcp.run.service']).toBe(extract_cloud_run_properties);
  });

  it('routes gcp.compute.subnetwork to extract_subnet_properties (the only entry that uses node_id)', () => {
    expect(PROPERTY_EXTRACTORS['gcp.compute.subnetwork']).toBe(extract_subnet_properties);
  });

  it('routes gcp.firebase.hosting to extract_firebase_hosting_properties', () => {
    expect(PROPERTY_EXTRACTORS['gcp.firebase.hosting']).toBe(extract_firebase_hosting_properties);
  });

  it('routes gcp.compute.securityPolicy to extract_cloud_armor_properties', () => {
    expect(PROPERTY_EXTRACTORS['gcp.compute.securityPolicy']).toBe(extract_cloud_armor_properties);
  });

  it('aliases BOTH gcp.aiplatform.endpoint AND gcp.aiplatform.index to extract_vertex_ai_properties (the only "two keys, same fn" case)', () => {
    expect(PROPERTY_EXTRACTORS['gcp.aiplatform.endpoint']).toBe(extract_vertex_ai_properties);
    expect(PROPERTY_EXTRACTORS['gcp.aiplatform.index']).toBe(extract_vertex_ai_properties);
    expect(PROPERTY_EXTRACTORS['gcp.aiplatform.endpoint']).toBe(
      PROPERTY_EXTRACTORS['gcp.aiplatform.index'],
    );
  });
});

describe('PROPERTY_EXTRACTORS full mapping (one assertion per row)', () => {
  // Pin every row so a typo in dispatch.ts (e.g. routing gcp.run.job to
  // extract_cloud_run_properties instead of extract_cloud_run_job_properties)
  // fails loudly. This also gives the table 100% line coverage in one
  // describe block.
  it.each([
    ['gcp.run.service', extract_cloud_run_properties],
    ['gcp.run.job', extract_cloud_run_job_properties],
    ['gcp.sql.databaseInstance', extract_cloud_sql_properties],
    ['gcp.cloudfunctions.function', extract_cloud_functions_properties],
    ['gcp.cloudscheduler.job', extract_cloud_scheduler_properties],
    ['gcp.storage.bucket', extract_storage_bucket_properties],
    ['gcp.pubsub.topic', extract_pubsub_properties],
    ['gcp.firestore.database', extract_firestore_properties],
    ['gcp.redis.instance', extract_memorystore_properties],
    ['gcp.secretmanager.secret', extract_secret_manager_properties],
    ['gcp.identityplatform.config', extract_identity_platform_properties],
    ['gcp.bigquery.dataset', extract_bigquery_properties],
    ['gcp.apigateway.api', extract_api_gateway_properties],
    ['gcp.compute.globalForwardingRule', extract_load_balancer_properties],
    ['gcp.logging.sink', extract_logging_properties],
    ['gcp.aiplatform.endpoint', extract_vertex_ai_properties],
    ['gcp.aiplatform.index', extract_vertex_ai_properties],
    ['gcp.dataflow.job', extract_dataflow_properties],
    ['gcp.discoveryengine.searchEngine', extract_discovery_engine_properties],
    ['gcp.container.cluster', extract_gke_properties],
    ['gcp.run.domainMapping', extract_domain_mapping_properties],
    ['gcp.compute.managedSslCertificate', extract_custom_domain_properties],
    ['gcp.compute.backendBucket', extract_backend_bucket_properties],
    ['gcp.compute.network', extract_vpc_properties],
    ['gcp.compute.subnetwork', extract_subnet_properties],
    ['gcp.compute.securityPolicy', extract_cloud_armor_properties],
    ['gcp.firebase.hosting', extract_firebase_hosting_properties],
  ] as const)('maps %s correctly', (key, expected_fn) => {
    expect(PROPERTY_EXTRACTORS[key]).toBe(expected_fn);
  });
});

describe('PROPERTY_EXTRACTORS callable through dispatch table', () => {
  it('passes (data, region, node_id) through to subnet extractor (third arg is load-bearing)', () => {
    // extract_subnet_properties uses node_id to derive a deterministic CIDR
    // when ip_cidr_range is empty. Two different node_ids must produce two
    // different CIDRs — proves the third arg arrived at the function.
    const extractor = PROPERTY_EXTRACTORS['gcp.compute.subnetwork'];
    expect(extractor).toBeDefined();
    const a = extractor!({}, 'us-central1', 'node-a');
    const b = extractor!({}, 'us-central1', 'node-b');
    expect(a.ip_cidr_range).toBeTypeOf('string');
    expect(b.ip_cidr_range).toBeTypeOf('string');
    expect(a.ip_cidr_range).not.toEqual(b.ip_cidr_range);
  });

  it('works with two-arg call (the common case for the other 26 rows)', () => {
    const extractor = PROPERTY_EXTRACTORS['gcp.run.service'];
    expect(extractor).toBeDefined();
    // Calling with only (data, region) — node_id omitted. Should not throw.
    const result = extractor!({ image: 'gcr.io/p/svc:1' }, 'europe-west2');
    expect(result).toBeTypeOf('object');
  });
});
