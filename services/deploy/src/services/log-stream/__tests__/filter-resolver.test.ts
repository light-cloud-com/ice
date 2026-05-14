/**
 * Tests for the Cloud Logging filter resolver.
 *
 * Pure-function tests — no mocks, no I/O. Each case asserts the literal
 * filter string against `toBe` so the LT-3 streamer can rely on the format
 * being stable.
 */

import { describe, expect, it } from 'vitest';

import { resolveLogFilter, type SourceContext } from '../filter-resolver';

const PROJECT_ID = 'my-project';
const REGION = 'us-central1';

function makeCtx(overrides: Partial<SourceContext> & Pick<SourceContext, 'iceType'>): SourceContext {
  return {
    iceType: overrides.iceType,
    resource: overrides.resource ?? { name: 'my-resource', type: 'gcp.unspecified' },
    projectId: overrides.projectId ?? PROJECT_ID,
    region: 'region' in overrides ? overrides.region : REGION,
  };
}

describe('resolveLogFilter — supported iceTypes', () => {
  it('Compute.Container → cloud_run_revision filter with service_name + location', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Compute.Container',
        resource: { name: 'api-server', type: 'gcp.run.service' },
        region: 'us-central1',
      })
    );

    expect(result).toEqual({
      filter:
        'resource.type="cloud_run_revision" AND resource.labels.service_name="api-server" AND resource.labels.location="us-central1"',
    });
  });

  it('Compute.SsrSite → cloud_run_revision filter (SSR sites deploy to Cloud Run)', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Compute.SsrSite',
        resource: { name: 'web-frontend', type: 'gcp.run.service' },
        region: 'europe-west1',
      })
    );

    expect(result).toEqual({
      filter:
        'resource.type="cloud_run_revision" AND resource.labels.service_name="web-frontend" AND resource.labels.location="europe-west1"',
    });
  });

  it('Compute.ServerlessFunction → cloud_run_revision filter + v1-not-supported caveat', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Compute.ServerlessFunction',
        resource: { name: 'process-webhook', type: 'gcp.cloudfunctions.function' },
        region: 'us-central1',
      })
    );

    expect(result).toEqual({
      filter:
        'resource.type="cloud_run_revision" AND resource.labels.service_name="process-webhook" AND resource.labels.location="us-central1"',
      caveats: ['Cloud Functions v1 (legacy) is not supported.'],
    });
  });

  it('Compute.Worker → cloud_run_job filter with job_name + location', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Compute.Worker',
        resource: { name: 'nightly-batch', type: 'gcp.run.job' },
        region: 'us-central1',
      })
    );

    expect(result).toEqual({
      filter:
        'resource.type="cloud_run_job" AND resource.labels.job_name="nightly-batch" AND resource.labels.location="us-central1"',
    });
  });

  it('Database.PostgreSQL → cloudsql_database filter with <projectId>:<instanceName>', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Database.PostgreSQL',
        resource: { name: 'app-db', type: 'gcp.sql.instance' },
        projectId: 'my-project',
      })
    );

    expect(result).toEqual({
      filter:
        'resource.type="cloudsql_database" AND resource.labels.database_id="my-project:app-db"',
    });
  });

  it('Database.MySQL → cloudsql_database filter with <projectId>:<instanceName>', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Database.MySQL',
        resource: { name: 'orders-db', type: 'gcp.sql.instance' },
        projectId: 'shop-prod',
      })
    );

    expect(result).toEqual({
      filter:
        'resource.type="cloudsql_database" AND resource.labels.database_id="shop-prod:orders-db"',
    });
  });

  it('Database.Redis → redis_instance filter with instance_id + region', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Database.Redis',
        resource: { name: 'session-cache', type: 'gcp.redis.instance' },
        region: 'us-central1',
      })
    );

    expect(result).toEqual({
      filter:
        'resource.type="redis_instance" AND resource.labels.instance_id="session-cache" AND resource.labels.region="us-central1"',
    });
  });

  it('Database.MongoDB → gce_instance filter + GCE-only caveat', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Database.MongoDB',
        resource: { name: 'mongo-1', type: 'gcp.compute.instance' },
      })
    );

    expect(result).toEqual({
      filter: 'resource.type="gce_instance" AND resource.labels.instance_id="mongo-1"',
      caveats: [
        'MongoDB on GCE — only host-level VM logs are available; the MongoDB process does not emit to Cloud Logging.',
      ],
    });
  });
});

describe('resolveLogFilter — unsupported / dropped sources', () => {
  it('Compute.StaticSite → null (Firebase Hosting v1 sites do not emit Cloud Logging)', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Compute.StaticSite',
        resource: { name: 'marketing-site', type: 'gcp.firebase.hosting.site' },
      })
    );

    expect(result).toBeNull();
  });

  it('unknown iceType → null', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Compute.Made.Up',
        resource: { name: 'whatever', type: 'gcp.unspecified' },
      })
    );

    expect(result).toBeNull();
  });
});

describe('resolveLogFilter — region is optional', () => {
  it('Compute.Container without region omits the location label', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Compute.Container',
        resource: { name: 'api-server', type: 'gcp.run.service' },
        region: undefined,
      })
    );

    expect(result).toEqual({
      filter:
        'resource.type="cloud_run_revision" AND resource.labels.service_name="api-server"',
    });
    expect(result?.filter).not.toContain('resource.labels.location');
  });

  it('Compute.Worker without region omits the location label', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Compute.Worker',
        resource: { name: 'nightly-batch', type: 'gcp.run.job' },
        region: undefined,
      })
    );

    expect(result).toEqual({
      filter: 'resource.type="cloud_run_job" AND resource.labels.job_name="nightly-batch"',
    });
    expect(result?.filter).not.toContain('resource.labels.location');
  });

  it('Database.Redis without region omits the region label', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Database.Redis',
        resource: { name: 'session-cache', type: 'gcp.redis.instance' },
        region: undefined,
      })
    );

    expect(result).toEqual({
      filter:
        'resource.type="redis_instance" AND resource.labels.instance_id="session-cache"',
    });
    expect(result?.filter).not.toContain('resource.labels.region');
  });
});

describe('resolveLogFilter — caveats are surfaced verbatim', () => {
  it('Compute.ServerlessFunction caveat mentions v1 legacy is unsupported', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Compute.ServerlessFunction',
        resource: { name: 'fn', type: 'gcp.cloudfunctions.function' },
      })
    );

    expect(result?.caveats).toEqual(['Cloud Functions v1 (legacy) is not supported.']);
  });

  it('Database.MongoDB caveat names the GCE-host limitation explicitly', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Database.MongoDB',
        resource: { name: 'mongo-1', type: 'gcp.compute.instance' },
      })
    );

    expect(result?.caveats).toEqual([
      'MongoDB on GCE — only host-level VM logs are available; the MongoDB process does not emit to Cloud Logging.',
    ]);
  });

  it('iceTypes without caveats omit the caveats key', () => {
    const result = resolveLogFilter(
      makeCtx({
        iceType: 'Compute.Container',
        resource: { name: 'api-server', type: 'gcp.run.service' },
      })
    );

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('caveats');
  });
});
