/**
 * Tests for `extractors/ancillary.ts` — property extractors for the long
 * tail of GCP services (Secret Manager, Identity Platform, BigQuery,
 * Logging, Vertex AI, Dataflow, Discovery Engine, GKE, Domain Mapping,
 * Custom Domain, Backend Bucket, Firebase Hosting).
 *
 * Each extractor is a small data-shape transformer with no shared deps;
 * tests focus on:
 *   - default values for missing fields (the OR-fallbacks)
 *   - pass-through of user-supplied values
 *   - the nullish-coalescing (`??`) vs short-circuit (`||`) semantics
 *     on `mfaEnabled` (the only `??` site in this module)
 *   - `extract_domain_mapping_properties` host-resolution priority order:
 *     subdomain.hostname → bare hostname → empty string
 *   - `extract_custom_domain_properties` strict `!== false` semantics on
 *     three booleans (managed/enable_https/redirect_http) plus the
 *     trim+empty domain → `domains: []` branch
 *   - `extract_backend_bucket_properties` bucket_name fallback chain
 *     (bucket_name → name → empty string) and the strict `!== false`
 *     enable_cdn default
 *   - `extract_firebase_hosting_properties` legacy `source.repo`/branch
 *     fallback, the `example.com` placeholder filter, and snake/camel
 *     dual lookups for output_directory / build_command
 */
import { describe, it, expect } from 'vitest';
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

describe('extract_secret_manager_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_secret_manager_properties({}, 'us-central1')).toEqual({
      replication_type: 'automatic',
      bindings: [],
      labels: {},
    });
  });

  it('passes user-supplied replicationType through', () => {
    const result = extract_secret_manager_properties({ replicationType: 'user-managed' }, 'us-central1');
    expect(result.replication_type).toBe('user-managed');
  });

  it('falls back to "automatic" when replicationType is empty string', () => {
    const result = extract_secret_manager_properties({ replicationType: '' }, 'us-central1');
    expect(result.replication_type).toBe('automatic');
  });

  it('ignores the region argument', () => {
    const a = extract_secret_manager_properties({}, 'us-central1');
    const b = extract_secret_manager_properties({}, 'europe-west2');
    expect(a).toEqual(b);
  });

  it('passes bindings through verbatim from data.secrets', () => {
    const result = extract_secret_manager_properties(
      { secrets: [{ key: 'API_KEY', ref: 'prod-api-key' }, { key: 'TOKEN' }] },
      'us-central1',
    );
    expect(result.bindings).toEqual([{ key: 'API_KEY', ref: 'prod-api-key' }, { key: 'TOKEN' }]);
  });

  it('coerces missing or non-array secrets to []', () => {
    expect(extract_secret_manager_properties({ secrets: 'oops' }, 'us-central1').bindings).toEqual([]);
    expect(extract_secret_manager_properties({}, 'us-central1').bindings).toEqual([]);
  });
});

describe('extract_identity_platform_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_identity_platform_properties({}, 'us-central1')).toEqual({
      sign_in_providers: ['email', 'google'],
      mfa_enabled: false,
    });
  });

  it('passes user-supplied signInProviders through', () => {
    const result = extract_identity_platform_properties({ signInProviders: ['phone', 'github'] }, 'us-central1');
    expect(result.sign_in_providers).toEqual(['phone', 'github']);
  });

  it('uses ?? on mfaEnabled so explicit false stays false (not the default)', () => {
    // `??` returns the right side only on null/undefined — explicit false
    // stays false, distinguishing it from `||` which would coerce false → default.
    const result = extract_identity_platform_properties({ mfaEnabled: false }, 'us-central1');
    expect(result.mfa_enabled).toBe(false);
  });

  it('uses ?? on mfaEnabled so explicit true passes through', () => {
    const result = extract_identity_platform_properties({ mfaEnabled: true }, 'us-central1');
    expect(result.mfa_enabled).toBe(true);
  });

  it('defaults mfa_enabled to false when mfaEnabled is null', () => {
    const result = extract_identity_platform_properties({ mfaEnabled: null }, 'us-central1');
    expect(result.mfa_enabled).toBe(false);
  });

  it('does not include labels (this extractor omits the labels field)', () => {
    const result = extract_identity_platform_properties({}, 'us-central1');
    expect(Object.prototype.hasOwnProperty.call(result, 'labels')).toBe(false);
  });
});

describe('extract_bigquery_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_bigquery_properties({}, 'us-central1')).toEqual({
      location: 'us-central1',
      default_table_expiration_ms: undefined,
      labels: {},
    });
  });

  it('echoes the region into location', () => {
    const result = extract_bigquery_properties({}, 'europe-west2');
    expect(result.location).toBe('europe-west2');
  });

  it('passes tableExpirationMs through verbatim', () => {
    const result = extract_bigquery_properties({ tableExpirationMs: 86_400_000 }, 'us-central1');
    expect(result.default_table_expiration_ms).toBe(86_400_000);
  });
});

describe('extract_logging_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_logging_properties({}, 'us-central1')).toEqual({
      filter: '',
      destination_type: 'logging.googleapis.com',
      labels: {},
    });
  });

  it('passes user-supplied filter and destinationType through', () => {
    const result = extract_logging_properties(
      { filter: 'severity>=WARNING', destinationType: 'pubsub.googleapis.com' },
      'us-central1',
    );
    expect(result.filter).toBe('severity>=WARNING');
    expect(result.destination_type).toBe('pubsub.googleapis.com');
  });

  it('falls back when filter and destinationType are empty strings', () => {
    const result = extract_logging_properties({ filter: '', destinationType: '' }, 'us-central1');
    expect(result.filter).toBe('');
    expect(result.destination_type).toBe('logging.googleapis.com');
  });
});

describe('extract_vertex_ai_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_vertex_ai_properties({}, 'us-central1')).toEqual({
      region: 'us-central1',
      display_name: 'vertex-endpoint',
      labels: {},
    });
  });

  it('passes the user-supplied label through as display_name', () => {
    const result = extract_vertex_ai_properties({ label: 'my-endpoint' }, 'us-central1');
    expect(result.display_name).toBe('my-endpoint');
  });

  it('falls back to "vertex-endpoint" when label is an empty string', () => {
    const result = extract_vertex_ai_properties({ label: '' }, 'us-central1');
    expect(result.display_name).toBe('vertex-endpoint');
  });
});

describe('extract_dataflow_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_dataflow_properties({}, 'us-central1')).toEqual({
      region: 'us-central1',
      template_type: 'streaming',
      labels: {},
    });
  });

  it('passes user-supplied templateType through', () => {
    const result = extract_dataflow_properties({ templateType: 'batch' }, 'us-central1');
    expect(result.template_type).toBe('batch');
  });

  it('falls back to "streaming" when templateType is empty', () => {
    const result = extract_dataflow_properties({ templateType: '' }, 'us-central1');
    expect(result.template_type).toBe('streaming');
  });
});

describe('extract_discovery_engine_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_discovery_engine_properties({}, 'us-central1')).toEqual({
      location: 'us-central1',
      solution_type: 'SOLUTION_TYPE_SEARCH',
      labels: {},
    });
  });

  it('hardcodes solution_type to SOLUTION_TYPE_SEARCH regardless of input', () => {
    const result = extract_discovery_engine_properties({ solution_type: 'OTHER' }, 'us-central1');
    expect(result.solution_type).toBe('SOLUTION_TYPE_SEARCH');
  });
});

describe('extract_gke_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_gke_properties({}, 'us-central1')).toEqual({
      location: 'us-central1',
      initial_node_count: 3,
      machine_type: 'e2-standard-2',
      labels: {},
    });
  });

  it('passes user-supplied nodeCount and machineType through', () => {
    const result = extract_gke_properties({ nodeCount: 5, machineType: 'n1-standard-4' }, 'us-central1');
    expect(result.initial_node_count).toBe(5);
    expect(result.machine_type).toBe('n1-standard-4');
  });

  it('falls back to defaults when nodeCount is 0 (|| coerces falsy)', () => {
    // The expression is `data.nodeCount || 3`, so 0 is treated as missing.
    const result = extract_gke_properties({ nodeCount: 0 }, 'us-central1');
    expect(result.initial_node_count).toBe(3);
  });
});

describe('extract_domain_mapping_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_domain_mapping_properties({}, 'us-central1')).toEqual({
      domain: '',
      hostname: '',
      subdomain: '',
      ssl_mode: 'auto',
      region: 'us-central1',
      labels: {},
    });
  });

  it('joins subdomain.hostname when both are present', () => {
    const result = extract_domain_mapping_properties({ subdomain: 'api', hostname: 'example.com' }, 'us-central1');
    expect(result.domain).toBe('api.example.com');
    expect(result.hostname).toBe('example.com');
    expect(result.subdomain).toBe('api');
  });

  it('returns just hostname when subdomain is missing', () => {
    const result = extract_domain_mapping_properties({ hostname: 'example.com' }, 'us-central1');
    expect(result.domain).toBe('example.com');
  });

  it('returns just hostname when subdomain is an empty string (filter(Boolean) drops it)', () => {
    const result = extract_domain_mapping_properties({ subdomain: '', hostname: 'example.com' }, 'us-central1');
    expect(result.domain).toBe('example.com');
  });

  it('falls through to bare hostname when filter(Boolean).join() is empty (subdomain only, no hostname)', () => {
    // `[subdomain, undefined].filter(Boolean).join('.')` = "api"; the `||` falls back
    // to `hostname || ''` → undefined, then ''. So the second `||` chain is what
    // catches the no-hostname case.
    const result = extract_domain_mapping_properties({ subdomain: 'api' }, 'us-central1');
    expect(result.domain).toBe('api');
    expect(result.hostname).toBe('');
  });

  it('passes sslMode through when supplied', () => {
    const result = extract_domain_mapping_properties({ sslMode: 'manual' }, 'us-central1');
    expect(result.ssl_mode).toBe('manual');
  });

  it('falls back to "auto" when sslMode is empty', () => {
    const result = extract_domain_mapping_properties({ sslMode: '' }, 'us-central1');
    expect(result.ssl_mode).toBe('auto');
  });
});

describe('extract_custom_domain_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_custom_domain_properties({}, 'us-central1')).toEqual({
      managed: true,
      domains: [],
      ssl_certificate_id: '',
      enable_https: true,
      redirect_http: true,
      labels: {},
    });
  });

  it('wraps a non-empty domain into a single-element domains array', () => {
    const result = extract_custom_domain_properties({ domain: 'example.com' }, 'us-central1');
    expect(result.domains).toEqual(['example.com']);
  });

  it('trims surrounding whitespace from domain before wrapping', () => {
    const result = extract_custom_domain_properties({ domain: '  example.com  ' }, 'us-central1');
    expect(result.domains).toEqual(['example.com']);
  });

  it('returns domains: [] when domain is whitespace-only', () => {
    const result = extract_custom_domain_properties({ domain: '   ' }, 'us-central1');
    expect(result.domains).toEqual([]);
  });

  it('returns domains: [] when domain is missing', () => {
    const result = extract_custom_domain_properties({}, 'us-central1');
    expect(result.domains).toEqual([]);
  });

  it('flips managed to false only when autoProvisionCert === false (strict)', () => {
    // The expression is `data.autoProvisionCert !== false` — so any truthy
    // OR null/undefined leaves managed === true.
    const explicitFalse = extract_custom_domain_properties({ autoProvisionCert: false }, 'us-central1');
    const explicitTrue = extract_custom_domain_properties({ autoProvisionCert: true }, 'us-central1');
    const undef = extract_custom_domain_properties({}, 'us-central1');
    expect(explicitFalse.managed).toBe(false);
    expect(explicitTrue.managed).toBe(true);
    expect(undef.managed).toBe(true);
  });

  it('passes sslCertificateId through', () => {
    const result = extract_custom_domain_properties({ sslCertificateId: 'cert-123' }, 'us-central1');
    expect(result.ssl_certificate_id).toBe('cert-123');
  });

  it('flips enable_https/redirect_http to false only on strict false', () => {
    const result = extract_custom_domain_properties({ enableHttps: false, redirectHttpToHttps: false }, 'us-central1');
    expect(result.enable_https).toBe(false);
    expect(result.redirect_http).toBe(false);
  });

  it('keeps enable_https/redirect_http true when fields are missing or truthy', () => {
    const result = extract_custom_domain_properties({ enableHttps: true, redirectHttpToHttps: true }, 'us-central1');
    expect(result.enable_https).toBe(true);
    expect(result.redirect_http).toBe(true);
  });
});

describe('extract_backend_bucket_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_backend_bucket_properties({}, 'us-central1')).toEqual({
      bucket_name: '',
      enable_cdn: true,
      labels: {},
    });
  });

  it('prefers explicit bucket_name over name', () => {
    const result = extract_backend_bucket_properties({ bucket_name: 'my-bucket', name: 'fallback' }, 'us-central1');
    expect(result.bucket_name).toBe('my-bucket');
  });

  it('falls back to name when bucket_name is missing', () => {
    const result = extract_backend_bucket_properties({ name: 'fallback' }, 'us-central1');
    expect(result.bucket_name).toBe('fallback');
  });

  it('falls back to "" when both bucket_name and name are missing', () => {
    const result = extract_backend_bucket_properties({}, 'us-central1');
    expect(result.bucket_name).toBe('');
  });

  it('flips enable_cdn to false only when enable_cdn === false (strict)', () => {
    const explicitFalse = extract_backend_bucket_properties({ enable_cdn: false }, 'us-central1');
    const explicitTrue = extract_backend_bucket_properties({ enable_cdn: true }, 'us-central1');
    const undef = extract_backend_bucket_properties({}, 'us-central1');
    expect(explicitFalse.enable_cdn).toBe(false);
    expect(explicitTrue.enable_cdn).toBe(true);
    expect(undef.enable_cdn).toBe(true);
  });
});

describe('extract_firebase_hosting_properties', () => {
  it('returns defaults for an empty data object', () => {
    expect(extract_firebase_hosting_properties({}, 'us-central1')).toEqual({
      domain: undefined,
      repository: undefined,
      branch: 'main',
      output_directory: undefined,
      build_command: undefined,
      source_path: undefined,
      labels: {},
    });
  });

  it('returns trimmed user-supplied domain', () => {
    const result = extract_firebase_hosting_properties({ domain: '  app.example.com  ' }, 'us-central1');
    expect(result.domain).toBe('app.example.com');
  });

  it('strips the example.com placeholder domain', () => {
    const result = extract_firebase_hosting_properties({ domain: 'example.com' }, 'us-central1');
    expect(result.domain).toBeUndefined();
  });

  it('uses the trimmed-empty branch when domain is whitespace-only', () => {
    const result = extract_firebase_hosting_properties({ domain: '   ' }, 'us-central1');
    expect(result.domain).toBeUndefined();
  });

  it('passes through a top-level repository over source.repo', () => {
    const result = extract_firebase_hosting_properties(
      {
        repository: 'owner/top',
        source: { repo: 'owner/legacy', branch: 'dev' },
      },
      'us-central1',
    );
    expect(result.repository).toBe('owner/top');
  });

  it('falls back to source.repo when repository is missing (legacy form)', () => {
    const result = extract_firebase_hosting_properties(
      { source: { repo: 'owner/legacy', branch: 'dev' } },
      'us-central1',
    );
    expect(result.repository).toBe('owner/legacy');
    expect(result.branch).toBe('dev');
  });

  it('defaults branch to "main" when neither top-level branch nor source.branch is supplied', () => {
    const result = extract_firebase_hosting_properties({ repository: 'owner/repo' }, 'us-central1');
    expect(result.branch).toBe('main');
  });

  it('prefers top-level branch over source.branch', () => {
    const result = extract_firebase_hosting_properties(
      {
        branch: 'feature',
        source: { repo: 'owner/legacy', branch: 'dev' },
      },
      'us-central1',
    );
    expect(result.branch).toBe('feature');
  });

  it('returns repository undefined when the trimmed value is empty', () => {
    const result = extract_firebase_hosting_properties({ repository: '   ' }, 'us-central1');
    expect(result.repository).toBeUndefined();
  });

  it('handles a missing source object gracefully', () => {
    const result = extract_firebase_hosting_properties({ repository: 'owner/repo' }, 'us-central1');
    expect(result.repository).toBe('owner/repo');
    expect(result.branch).toBe('main');
  });

  it('reads output_directory snake-case', () => {
    const result = extract_firebase_hosting_properties({ output_directory: 'dist' }, 'us-central1');
    expect(result.output_directory).toBe('dist');
  });

  it('reads outputDirectory camelCase as fallback', () => {
    const result = extract_firebase_hosting_properties({ outputDirectory: 'build' }, 'us-central1');
    expect(result.output_directory).toBe('build');
  });

  it('reads build_command snake-case', () => {
    const result = extract_firebase_hosting_properties({ build_command: 'npm run build' }, 'us-central1');
    expect(result.build_command).toBe('npm run build');
  });

  it('reads buildCommand camelCase as fallback', () => {
    const result = extract_firebase_hosting_properties({ buildCommand: 'pnpm build' }, 'us-central1');
    expect(result.build_command).toBe('pnpm build');
  });

  it('reads source_path snake-case', () => {
    const result = extract_firebase_hosting_properties({ source_path: 'apps/web' }, 'us-central1');
    expect(result.source_path).toBe('apps/web');
  });

  it('reads path camelCase as fallback for source_path', () => {
    const result = extract_firebase_hosting_properties({ path: 'apps/web' }, 'us-central1');
    expect(result.source_path).toBe('apps/web');
  });

  it('returns each optional field undefined when the trimmed value is empty', () => {
    const result = extract_firebase_hosting_properties(
      {
        output_directory: '   ',
        build_command: '',
        source_path: '   ',
      },
      'us-central1',
    );
    expect(result.output_directory).toBeUndefined();
    expect(result.build_command).toBeUndefined();
    expect(result.source_path).toBeUndefined();
  });

  it('keeps the always-present labels: {} field', () => {
    const result = extract_firebase_hosting_properties({}, 'us-central1');
    expect(result.labels).toEqual({});
  });
});
