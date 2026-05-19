/**
 * Tests for the inline-table-view pure helpers. Covers:
 *
 *   - getFamilyColor — concept-family lookup with three fallbacks
 *   - deriveStatus — three-tier (deploy_status → pipeline → deployed history)
 *   - buildEndpoints — live URL / domain / repo / image / console URL builder
 *   - getSettingsChips — type-specific salient field selector
 *   - formatRelativeTime — past-time humanizer
 *   - providerLabel — short provider tag
 *
 * No React, no Redux. Each test pins one slice of the lookup matrix or one
 * branch of a conditional so a future refactor can't silently change the
 * derived row's status or labels.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildEndpoints,
  deriveStatus,
  formatRelativeTime,
  getFamilyColor,
  getSettingsChips,
  PROVIDER_LABELS,
  providerLabel,
  STATUS_COLORS,
  type StatusContext,
} from '../inline-table-view-helpers';
import type { CardNode } from '../../../store/slices/cards-slice';
import type { DeployedResource, NodeDriftInfo } from '../../../store/slices/deploy-slice';
import type { NodePipelineStatus } from '../../../store/slices/pipeline-slice';

// ─── Fixture helpers ────────────────────────────────────────────────────────

function node(id: string, data: Record<string, unknown> = {}, type: CardNode['type'] = 'block'): CardNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    data,
  };
}

function ctx(overrides: Partial<StatusContext> = {}): StatusContext {
  return {
    nodePipelineStatus: {},
    driftByNode: {},
    deployedResources: [],
    ...overrides,
  };
}

// ─── getFamilyColor ─────────────────────────────────────────────────────────

describe('getFamilyColor', () => {
  it('returns the default color for empty / undefined iceType', () => {
    expect(getFamilyColor(undefined)).toBe('#64748b');
    expect(getFamilyColor('')).toBe('#64748b');
  });

  it('prefers the @ice/blocks visual-family registry (compute)', () => {
    // Compute.Container maps to family=compute via @ice/blocks → #8b5cf6.
    expect(getFamilyColor('Compute.Container')).toBe('#8b5cf6');
  });

  it('falls back to BLOCK_ACCENT_COLORS by suffix', () => {
    // Block.Cache is not in the concept family registry → suffix lookup
    // → BLOCK_ACCENT_COLORS['Cache'] = '#3B48CC'.
    expect(getFamilyColor('Block.Cache')).toBe('#3B48CC');
    expect(getFamilyColor('Block.Storage')).toBe('#1A9C3E');
  });

  it('falls back to category-prefix → family lookup', () => {
    // CATEGORY_FAMILY_FALLBACK['Networking'] = 'edge' → #f59e0b.
    expect(getFamilyColor('Networking.Unknown')).toBe('#f59e0b');
    // 'Cache' prefix → 'data' family → #10b981.
    expect(getFamilyColor('Cache.Unknown')).toBe('#10b981');
    // 'AI' prefix → 'ai' family → #ec4899.
    expect(getFamilyColor('AI.Custom')).toBe('#ec4899');
  });

  it('returns the default color when no fallback path matches', () => {
    expect(getFamilyColor('TotallyUnknown.Type')).toBe('#64748b');
  });
});

// ─── deriveStatus ───────────────────────────────────────────────────────────

describe('deriveStatus — primary deploy_status', () => {
  it('returns "live" when data.deploy_status === "active"', () => {
    expect(deriveStatus(node('n', { deploy_status: 'active' }), ctx())).toBe('live');
  });

  it('returns "drifted" when active and drift status overlay is set', () => {
    const drifted = deriveStatus(
      node('n', { deploy_status: 'active' }),
      ctx({ driftByNode: { n: { nodeId: 'n', status: 'drifted', changes: [] } as NodeDriftInfo } }),
    );
    expect(drifted).toBe('drifted');
  });

  it('treats missing/extra drift status the same as drifted', () => {
    const missing = deriveStatus(
      node('n', { deploy_status: 'active' }),
      ctx({ driftByNode: { n: { nodeId: 'n', status: 'missing', changes: [] } as NodeDriftInfo } }),
    );
    const extra = deriveStatus(
      node('n', { deploy_status: 'active' }),
      ctx({ driftByNode: { n: { nodeId: 'n', status: 'extra', changes: [] } as NodeDriftInfo } }),
    );
    expect(missing).toBe('drifted');
    expect(extra).toBe('drifted');
  });

  it('does NOT mark as drifted for "in_sync"', () => {
    const live = deriveStatus(
      node('n', { deploy_status: 'active' }),
      ctx({ driftByNode: { n: { nodeId: 'n', status: 'in_sync', changes: [] } as NodeDriftInfo } }),
    );
    expect(live).toBe('live');
  });

  it('returns "deploying" when data.deploy_status === "deploying"', () => {
    expect(deriveStatus(node('n', { deploy_status: 'deploying' }), ctx())).toBe('deploying');
  });

  it('returns "failed" when data.deploy_status === "error"', () => {
    expect(deriveStatus(node('n', { deploy_status: 'error' }), ctx())).toBe('failed');
  });

  it('lowercases deploy_status before matching', () => {
    expect(deriveStatus(node('n', { deploy_status: 'ACTIVE' }), ctx())).toBe('live');
  });
});

describe('deriveStatus — pipeline fallback', () => {
  it('maps pipeline.status === "success" to live (or drifted)', () => {
    const pipeline: NodePipelineStatus = { status: 'success' };
    expect(deriveStatus(node('n'), ctx({ nodePipelineStatus: { n: pipeline } }))).toBe('live');
    expect(
      deriveStatus(
        node('n'),
        ctx({
          nodePipelineStatus: { n: pipeline },
          driftByNode: { n: { nodeId: 'n', status: 'drifted', changes: [] } as NodeDriftInfo },
        }),
      ),
    ).toBe('drifted');
  });

  it('maps pipeline.status === "failed" to failed', () => {
    expect(deriveStatus(node('n'), ctx({ nodePipelineStatus: { n: { status: 'failed' } } }))).toBe('failed');
  });

  it('maps pipeline.status === "building" to building', () => {
    expect(deriveStatus(node('n'), ctx({ nodePipelineStatus: { n: { status: 'building' } } }))).toBe('building');
  });

  it('maps pipeline.status === "deploying" to deploying', () => {
    expect(deriveStatus(node('n'), ctx({ nodePipelineStatus: { n: { status: 'deploying' } } }))).toBe('deploying');
  });

  it('maps pipeline.status === "queued" to queued', () => {
    expect(deriveStatus(node('n'), ctx({ nodePipelineStatus: { n: { status: 'queued' } } }))).toBe('queued');
  });

  it('treats pipeline.status === "idle" as a tertiary-fallback signal', () => {
    // When pipeline is idle but no other source set, deriveStatus should
    // return idle.
    expect(deriveStatus(node('n'), ctx({ nodePipelineStatus: { n: { status: 'idle' } } }))).toBe('idle');
  });
});

describe('deriveStatus — deployed-resources fallback', () => {
  function deployed(node_id: string, status: string): DeployedResource {
    return {
      node_id,
      name: 'r',
      type: 't',
      provider_id: 'p',
      status,
      deployed_at: '2026-01-01T00:00:00Z',
    };
  }

  it('maps deployed status "failed" / "error" to failed', () => {
    expect(deriveStatus(node('n'), ctx({ deployedResources: [deployed('n', 'failed')] }))).toBe('failed');
    expect(deriveStatus(node('n'), ctx({ deployedResources: [deployed('n', 'error')] }))).toBe('failed');
  });

  it('maps deployed status success/created/updated/deployed to live', () => {
    expect(deriveStatus(node('n'), ctx({ deployedResources: [deployed('n', 'success')] }))).toBe('live');
    expect(deriveStatus(node('n'), ctx({ deployedResources: [deployed('n', 'created')] }))).toBe('live');
    expect(deriveStatus(node('n'), ctx({ deployedResources: [deployed('n', 'updated')] }))).toBe('live');
    expect(deriveStatus(node('n'), ctx({ deployedResources: [deployed('n', 'deployed')] }))).toBe('live');
  });

  it('lowercases deployed status (handles uppercase)', () => {
    expect(deriveStatus(node('n'), ctx({ deployedResources: [deployed('n', 'SUCCESS')] }))).toBe('live');
  });

  it('returns drifted for a deployed-success node when drift overlay is set', () => {
    expect(
      deriveStatus(
        node('n'),
        ctx({
          deployedResources: [deployed('n', 'success')],
          driftByNode: { n: { nodeId: 'n', status: 'drifted', changes: [] } as NodeDriftInfo },
        }),
      ),
    ).toBe('drifted');
  });

  it('treats unrecognized deployed status as idle (falls through)', () => {
    expect(deriveStatus(node('n'), ctx({ deployedResources: [deployed('n', 'pending')] }))).toBe('idle');
  });

  it('handles a deployed entry with empty status (falls through to idle)', () => {
    const r = deployed('n', '');
    expect(deriveStatus(node('n'), ctx({ deployedResources: [r] }))).toBe('idle');
  });
});

describe('deriveStatus — base case', () => {
  it('returns idle when no source matches', () => {
    expect(deriveStatus(node('n'), ctx())).toBe('idle');
  });
});

// ─── STATUS_COLORS ─────────────────────────────────────────────────────────

describe('STATUS_COLORS', () => {
  it('exports a color descriptor for every RowStatus value', () => {
    const expected: Array<keyof typeof STATUS_COLORS> = [
      'live',
      'building',
      'deploying',
      'queued',
      'drifted',
      'failed',
      'idle',
    ];
    for (const status of expected) {
      expect(STATUS_COLORS[status]).toMatchObject({
        dot: expect.any(String),
        bg: expect.any(String),
        text: expect.any(String),
        border: expect.any(String),
      });
    }
  });
});

// ─── buildEndpoints ─────────────────────────────────────────────────────────

describe('buildEndpoints — live URL', () => {
  it('returns an empty list for a bare node', () => {
    expect(buildEndpoints(node('n'))).toEqual([]);
  });

  it('returns data.url as a live endpoint when set', () => {
    const out = buildEndpoints(node('n', { url: 'https://api.example.com' }));
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ kind: 'live', url: 'https://api.example.com', label: 'https://api.example.com' });
  });

  it('falls back to deploy_outputs.custom_domain_url', () => {
    const out = buildEndpoints(node('n', { deploy_outputs: { custom_domain_url: 'https://www.example.com' } }));
    expect(out[0].url).toBe('https://www.example.com');
  });

  it('falls back to default_url, then url/endpoint, then deployed.outputs', () => {
    const out1 = buildEndpoints(node('n', { deploy_outputs: { default_url: 'https://default.example' } }));
    expect(out1[0].url).toBe('https://default.example');
    const out2 = buildEndpoints(node('n', { deploy_outputs: { url: 'https://o.example', endpoint: 'unused' } }));
    expect(out2[0].url).toBe('https://o.example');
    const out3 = buildEndpoints(node('n', { deploy_outputs: { endpoint: 'https://ep.example' } }));
    expect(out3[0].url).toBe('https://ep.example');
    const out4 = buildEndpoints(node('n'), {
      node_id: 'n',
      name: '',
      type: '',
      provider_id: 'pid',
      status: 'deployed',
      outputs: { url: 'https://from-deploy.example' },
      deployed_at: '',
    });
    expect(out4[0].url).toBe('https://from-deploy.example');
    const out5 = buildEndpoints(node('n'), {
      node_id: 'n',
      name: '',
      type: '',
      provider_id: 'pid',
      status: 'deployed',
      outputs: { endpoint: 'https://from-deploy-ep.example' },
      deployed_at: '',
    });
    expect(out5[0].url).toBe('https://from-deploy-ep.example');
  });

  it('emits a secondary live endpoint for the default URL alongside a custom domain', () => {
    const out = buildEndpoints(
      node('n', {
        deploy_outputs: {
          custom_domain_url: 'https://www.example.com',
          default_url: 'https://app.web.example',
        },
      }),
    );
    expect(out).toHaveLength(2);
    expect(out[0].url).toBe('https://www.example.com');
    expect(out[1].url).toBe('https://app.web.example');
  });

  it('does NOT duplicate the default URL when it equals the live URL', () => {
    const out = buildEndpoints(
      node('n', {
        url: 'https://app.web.example',
        deploy_outputs: {
          custom_domain_url: 'https://www.example.com',
          default_url: 'https://app.web.example',
        },
      }),
    );
    // url wins as live; custom_domain_url + default_url stays as one entry
    // since defaultUrl === liveUrl excludes the secondary push.
    expect(out.filter((e) => e.kind === 'live')).toHaveLength(1);
  });
});

describe('buildEndpoints — domain', () => {
  it('emits a domain endpoint when data.domain is set and not in liveUrl', () => {
    const out = buildEndpoints(node('n', { domain: 'example.com' }));
    const domain = out.find((e) => e.kind === 'domain');
    expect(domain).toEqual({ kind: 'domain', url: 'https://example.com', label: 'example.com' });
  });

  it('does NOT emit a domain endpoint when liveUrl already contains the domain', () => {
    const out = buildEndpoints(node('n', { url: 'https://example.com', domain: 'example.com' }));
    expect(out.some((e) => e.kind === 'domain')).toBe(false);
  });
});

describe('buildEndpoints — repo', () => {
  it('emits a repo endpoint with branch in the URL', () => {
    const out = buildEndpoints(node('n', { repository: 'octocat/hello', branch: 'develop' }));
    const repo = out.find((e) => e.kind === 'repo');
    expect(repo).toEqual({
      kind: 'repo',
      url: 'https://github.com/octocat/hello/tree/develop',
      label: 'octocat/hello @ develop',
    });
  });

  it('emits a repo endpoint without branch when none is set', () => {
    const out = buildEndpoints(node('n', { repository: 'octocat/hello' }));
    const repo = out.find((e) => e.kind === 'repo');
    expect(repo).toEqual({
      kind: 'repo',
      url: 'https://github.com/octocat/hello',
      label: 'octocat/hello',
    });
  });

  it('strips https://github.com/ and .git suffix from the repository url', () => {
    const out = buildEndpoints(node('n', { repository: 'https://github.com/octocat/hello.git', branch: 'main' }));
    const repo = out.find((e) => e.kind === 'repo');
    expect(repo!.url).toBe('https://github.com/octocat/hello/tree/main');
  });
});

describe('buildEndpoints — image', () => {
  it('emits an image endpoint for a gcr.io image', () => {
    const out = buildEndpoints(node('n', { image: 'gcr.io/my-project/api:v1' }));
    const image = out.find((e) => e.kind === 'image');
    expect(image!.url).toBe('https://console.cloud.google.com/artifacts?project=my-project');
    expect(image!.label).toBe('gcr.io/my-project/api:v1');
  });

  it('emits an image endpoint for an Artifact Registry image (-docker.pkg.dev)', () => {
    const out = buildEndpoints(node('n', { image: 'us-docker.pkg.dev/my-project/repo/api:v1' }));
    const image = out.find((e) => e.kind === 'image');
    expect(image!.url).toBe('https://console.cloud.google.com/artifacts?project=my-project');
  });

  it('emits an image endpoint for an ECR image (extracts region)', () => {
    const out = buildEndpoints(node('n', { image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/api:v1' }));
    const image = out.find((e) => e.kind === 'image');
    expect(image!.url).toBe('https://eu-west-1.console.aws.amazon.com/ecr/repositories');
  });

  it('emits an image endpoint for a Docker Hub image (lowercase regex)', () => {
    const out = buildEndpoints(node('n', { image: 'octocat/hello:latest' }));
    const image = out.find((e) => e.kind === 'image');
    expect(image!.url).toBe('https://hub.docker.com/r/octocat/hello');
  });

  it('emits an image endpoint stripping docker.io/ prefix', () => {
    const out = buildEndpoints(node('n', { image: 'docker.io/library/postgres:16' }));
    const image = out.find((e) => e.kind === 'image');
    expect(image!.url).toBe('https://hub.docker.com/r/library/postgres');
  });

  it('falls back to deployed_image when image is missing', () => {
    const out = buildEndpoints(node('n', { deployed_image: 'gcr.io/proj/api' }));
    expect(out.some((e) => e.kind === 'image')).toBe(true);
  });

  it('does NOT emit an image endpoint for an unrecognized registry', () => {
    const out = buildEndpoints(node('n', { image: 'private-registry.example.com/repo:tag' }));
    expect(out.some((e) => e.kind === 'image')).toBe(false);
  });
});

describe('buildEndpoints — provider console', () => {
  function deployed(): DeployedResource {
    return {
      node_id: 'n',
      name: '',
      type: '',
      provider_id: 'pid',
      status: 'deployed',
      deployed_at: '',
    };
  }

  it('emits a GCP Cloud Run console URL for Compute.Container', () => {
    const out = buildEndpoints(
      node('n', { provider: 'gcp', iceType: 'Compute.Container', region: 'us-east1' }),
      deployed(),
    );
    const console_ = out.find((e) => e.kind === 'console');
    expect(console_!.url).toBe('https://console.cloud.google.com/run?region=us-east1');
    expect(console_!.label).toBe('GCP console');
  });

  it("defaults GCP Cloud Run region to 'us-central1' when region missing", () => {
    const out = buildEndpoints(node('n', { provider: 'gcp', iceType: 'Compute.Container' }), deployed());
    const console_ = out.find((e) => e.kind === 'console');
    expect(console_!.url).toBe('https://console.cloud.google.com/run?region=us-central1');
  });

  it('emits a GCP Cloud SQL console URL for Database.*', () => {
    const out = buildEndpoints(node('n', { provider: 'gcp', iceType: 'Database.PostgreSQL' }), deployed());
    expect(out.find((e) => e.kind === 'console')!.url).toBe('https://console.cloud.google.com/sql/instances');
  });

  it('emits a GCP Storage console URL for Storage.*', () => {
    const out = buildEndpoints(node('n', { provider: 'gcp', iceType: 'Storage.Bucket' }), deployed());
    expect(out.find((e) => e.kind === 'console')!.url).toBe('https://console.cloud.google.com/storage/browser');
  });

  it('emits a Firebase hosting console URL for Compute.StaticSite on GCP', () => {
    const out = buildEndpoints(node('n', { provider: 'gcp', iceType: 'Compute.StaticSite' }), deployed());
    expect(out.find((e) => e.kind === 'console')!.url).toBe('https://console.firebase.google.com/project/_/hosting');
  });

  it('emits an AWS ECS console URL for Compute.Container', () => {
    const out = buildEndpoints(
      node('n', { provider: 'aws', iceType: 'Compute.Container', region: 'eu-west-1' }),
      deployed(),
    );
    expect(out.find((e) => e.kind === 'console')!.url).toBe(
      'https://eu-west-1.console.aws.amazon.com/ecs/home?region=eu-west-1',
    );
  });

  it('defaults AWS region to us-east-1 when region missing', () => {
    const out = buildEndpoints(node('n', { provider: 'aws', iceType: 'Compute.Container' }), deployed());
    expect(out.find((e) => e.kind === 'console')!.url).toContain('us-east-1');
  });

  it('emits AWS RDS, S3, StaticSite console URLs', () => {
    const out1 = buildEndpoints(node('n', { provider: 'aws', iceType: 'Database.MySQL' }), deployed());
    expect(out1.find((e) => e.kind === 'console')!.url).toContain('rds');
    const out2 = buildEndpoints(node('n', { provider: 'aws', iceType: 'Storage.Bucket' }), deployed());
    expect(out2.find((e) => e.kind === 'console')!.url).toContain('s3.console.aws.amazon.com');
    const out3 = buildEndpoints(node('n', { provider: 'aws', iceType: 'Compute.StaticSite' }), deployed());
    expect(out3.find((e) => e.kind === 'console')!.url).toContain('s3.console.aws.amazon.com');
  });

  it('emits Azure portal home URL for any iceType on azure', () => {
    const out = buildEndpoints(node('n', { provider: 'azure', iceType: 'Compute.Container' }), deployed());
    expect(out.find((e) => e.kind === 'console')!.url).toBe('https://portal.azure.com/#home');
  });

  it('returns the base provider console URL when no deep link applies', () => {
    const out = buildEndpoints(node('n', { provider: 'cloudflare', iceType: 'Network.CDN' }), deployed());
    expect(out.find((e) => e.kind === 'console')!.url).toBe('https://dash.cloudflare.com/');
  });

  it('skips the console endpoint for an unknown provider', () => {
    const out = buildEndpoints(node('n', { provider: 'unknown', iceType: 'Compute.Container' }), deployed());
    expect(out.some((e) => e.kind === 'console')).toBe(false);
  });

  it('does not emit a console endpoint when neither providerId nor deployed are set', () => {
    const out = buildEndpoints(node('n', { provider: 'aws', iceType: 'Compute.Container' }));
    expect(out.some((e) => e.kind === 'console')).toBe(false);
  });

  it('emits a console endpoint when provider_id is set on the node (without DeployedResource)', () => {
    const out = buildEndpoints(node('n', { provider: 'gcp', iceType: 'Compute.Container', provider_id: 'pid' }));
    expect(out.some((e) => e.kind === 'console')).toBe(true);
  });

  it('falls back from data.iceType to node.type when iceType is missing', () => {
    // node.type is 'block' but the provider/iceType determination uses
    // data.iceType ?? node.type → for a 'block' fallback, the gcp branch
    // path won't deep-link → goes to base.
    const out = buildEndpoints(node('n', { provider: 'gcp', provider_id: 'pid' }, 'resource'));
    expect(out.find((e) => e.kind === 'console')!.url).toBe('https://console.cloud.google.com/');
  });
});

// ─── getSettingsChips ───────────────────────────────────────────────────────

describe('getSettingsChips — Compute.StaticSite', () => {
  it('emits framework, build, output, domain chips', () => {
    const chips = getSettingsChips(
      node('n', {
        iceType: 'Compute.StaticSite',
        framework: 'next',
        buildCommand: 'npm run build',
        outputDir: 'out',
        domain: 'www.example.com',
      }),
    );
    expect(chips).toEqual([
      { key: 'framework', value: 'next' },
      { key: 'build', value: 'npm run build' },
      { key: 'output', value: 'out' },
      { key: 'domain', value: 'www.example.com' },
    ]);
  });

  it('omits chips with null/empty/undefined values', () => {
    const chips = getSettingsChips(node('n', { iceType: 'Compute.StaticSite', framework: '', outputDir: null }));
    expect(chips.find((c) => c.key === 'framework')).toBeUndefined();
    expect(chips.find((c) => c.key === 'output')).toBeUndefined();
  });
});

describe('getSettingsChips — Compute.Container', () => {
  it('emits camelCase instances chip', () => {
    const chips = getSettingsChips(
      node('n', {
        iceType: 'Compute.Container',
        minInstances: 1,
        maxInstances: 5,
        image: 'octocat/api:v1',
        port: 8080,
        runtime: 'node20',
      }),
    );
    expect(chips.find((c) => c.key === 'instances')!.value).toBe('1–5');
    expect(chips.find((c) => c.key === 'image')!.value).toBe('octocat/api:v1');
    expect(chips.find((c) => c.key === 'port')!.value).toBe('8080');
    expect(chips.find((c) => c.key === 'runtime')!.value).toBe('node20');
  });

  it('falls back to snake_case instances chip', () => {
    const chips = getSettingsChips(node('n', { iceType: 'Compute.Container', min_instances: 2, max_instances: 4 }));
    expect(chips.find((c) => c.key === 'instances')!.value).toBe('2–4');
  });

  it('matches Compute.ScalableBackend like Compute.Container', () => {
    const chips = getSettingsChips(node('n', { iceType: 'Compute.ScalableBackend', minInstances: 1, maxInstances: 3 }));
    expect(chips.find((c) => c.key === 'instances')!.value).toBe('1–3');
  });

  it('prefers deployed_image over image', () => {
    const chips = getSettingsChips(
      node('n', { iceType: 'Compute.Container', deployed_image: 'gcr.io/proj/api', image: 'unused' }),
    );
    expect(chips.find((c) => c.key === 'image')!.value).toBe('gcr.io/proj/api');
  });
});

describe('getSettingsChips — Database.*', () => {
  it('emits engine, size, storage, HA chips', () => {
    const chips = getSettingsChips(
      node('n', {
        iceType: 'Database.PostgreSQL',
        engine: 'postgres',
        instanceClass: 'db.t3.medium',
        storage: '100Gi',
        multiAz: true,
      }),
    );
    expect(chips.find((c) => c.key === 'engine')!.value).toBe('postgres');
    expect(chips.find((c) => c.key === 'size')!.value).toBe('db.t3.medium');
    expect(chips.find((c) => c.key === 'storage')!.value).toBe('100Gi');
    expect(chips.find((c) => c.key === 'HA')!.value).toBe('multi-az');
  });

  it('falls back to version, tier, and highAvailability', () => {
    const chips = getSettingsChips(
      node('n', { iceType: 'Database.MySQL', version: '8.0', tier: 'medium', highAvailability: true }),
    );
    expect(chips.find((c) => c.key === 'engine')!.value).toBe('8.0');
    expect(chips.find((c) => c.key === 'size')!.value).toBe('medium');
    expect(chips.find((c) => c.key === 'HA')!.value).toBe('multi-az');
  });

  it('omits HA chip when neither multiAz nor highAvailability is set', () => {
    const chips = getSettingsChips(node('n', { iceType: 'Database.MySQL' }));
    expect(chips.find((c) => c.key === 'HA')).toBeUndefined();
  });
});

describe('getSettingsChips — Storage.*', () => {
  it('emits class, lifecycle, versioning chips', () => {
    const chips = getSettingsChips(
      node('n', {
        iceType: 'Storage.Bucket',
        storageClass: 'NEARLINE',
        lifecycleDays: 30,
        versioning: true,
      }),
    );
    expect(chips.find((c) => c.key === 'class')!.value).toBe('NEARLINE');
    expect(chips.find((c) => c.key === 'lifecycle')!.value).toBe('30d');
    expect(chips.find((c) => c.key === 'versioning')!.value).toBe('on');
  });

  it('omits lifecycle when lifecycleDays is missing', () => {
    const chips = getSettingsChips(node('n', { iceType: 'Storage.Bucket' }));
    expect(chips.find((c) => c.key === 'lifecycle')).toBeUndefined();
  });

  it('omits versioning when versioning is falsy', () => {
    const chips = getSettingsChips(node('n', { iceType: 'Storage.Bucket', versioning: false }));
    expect(chips.find((c) => c.key === 'versioning')).toBeUndefined();
  });
});

describe('getSettingsChips — Source.GitHubRepo', () => {
  it('emits source chip with branch (default main)', () => {
    const chips = getSettingsChips(node('n', { iceType: 'Source.GitHubRepo', repository: 'octocat/hello' }));
    expect(chips.find((c) => c.key === 'source')!.value).toBe('octocat/hello @ main');
  });

  it('respects an explicit branch', () => {
    const chips = getSettingsChips(
      node('n', { iceType: 'Source.GitHubRepo', repository: 'octocat/hello', branch: 'develop' }),
    );
    expect(chips.find((c) => c.key === 'source')!.value).toBe('octocat/hello @ develop');
  });

  it('omits source chip when no repository is set', () => {
    const chips = getSettingsChips(node('n', { iceType: 'Source.GitHubRepo' }));
    expect(chips.find((c) => c.key === 'source')).toBeUndefined();
  });
});

describe('getSettingsChips — CustomDomain', () => {
  it('emits domain and cert chips for Networking.CustomDomain', () => {
    const chips = getSettingsChips(
      node('n', { iceType: 'Networking.CustomDomain', domain: 'www.example.com', certStatus: 'active' }),
    );
    expect(chips.find((c) => c.key === 'domain')!.value).toBe('www.example.com');
    expect(chips.find((c) => c.key === 'cert')!.value).toBe('active');
  });

  it('emits domain and cert chips for Edge.CustomDomain', () => {
    const chips = getSettingsChips(node('n', { iceType: 'Edge.CustomDomain', domain: 'www.example.com' }));
    expect(chips.find((c) => c.key === 'domain')!.value).toBe('www.example.com');
  });
});

describe('getSettingsChips — generic fields', () => {
  it('always emits the region chip when present', () => {
    const chips = getSettingsChips(node('n', { iceType: 'Compute.Container', region: 'us-central1' }));
    expect(chips.find((c) => c.key === 'region')!.value).toBe('us-central1');
  });

  it('emits behavior chip when behavior !== "singleton"', () => {
    const chips1 = getSettingsChips(node('n', { iceType: 'Compute.Container', behavior: 'scalable' }));
    expect(chips1.find((c) => c.key === 'behavior')!.value).toBe('scalable');
    const chips2 = getSettingsChips(node('n', { iceType: 'Compute.Container', behavior: 'singleton' }));
    expect(chips2.find((c) => c.key === 'behavior')).toBeUndefined();
  });
});

describe('getSettingsChips — empty data', () => {
  it('returns an empty array when node.data is empty', () => {
    expect(getSettingsChips(node('n'))).toEqual([]);
  });
});

// ─── formatRelativeTime ─────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z').getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "—" for a falsy timestamp', () => {
    expect(formatRelativeTime(undefined)).toBe('—');
    expect(formatRelativeTime(null)).toBe('—');
    expect(formatRelativeTime(0)).toBe('—');
  });

  it('returns "—" for an unparseable string', () => {
    expect(formatRelativeTime('not-a-date')).toBe('—');
  });

  it('returns "just now" for sub-45-second deltas', () => {
    const now = Date.now();
    expect(formatRelativeTime(now)).toBe('just now');
    expect(formatRelativeTime(now - 30 * 1000)).toBe('just now');
    expect(formatRelativeTime(now - 44 * 1000)).toBe('just now');
  });

  it('returns "just now" for future timestamps (negative diff)', () => {
    expect(formatRelativeTime(Date.now() + 60 * 1000)).toBe('just now');
  });

  it('returns "Xm ago" for sub-hour deltas', () => {
    expect(formatRelativeTime(Date.now() - 60 * 1000)).toBe('1m ago');
    expect(formatRelativeTime(Date.now() - 59 * 60 * 1000)).toBe('59m ago');
  });

  it('returns "Xh ago" for sub-day deltas', () => {
    expect(formatRelativeTime(Date.now() - 60 * 60 * 1000)).toBe('1h ago');
    expect(formatRelativeTime(Date.now() - 23 * 60 * 60 * 1000)).toBe('23h ago');
  });

  it('returns "Xd ago" for sub-month deltas', () => {
    expect(formatRelativeTime(Date.now() - 24 * 60 * 60 * 1000)).toBe('1d ago');
    expect(formatRelativeTime(Date.now() - 29 * 24 * 60 * 60 * 1000)).toBe('29d ago');
  });

  it('returns "Xmo ago" for sub-year deltas', () => {
    expect(formatRelativeTime(Date.now() - 30 * 24 * 60 * 60 * 1000)).toBe('1mo ago');
    expect(formatRelativeTime(Date.now() - 11 * 30 * 24 * 60 * 60 * 1000)).toBe('11mo ago');
  });

  it('returns "Xy ago" for over-a-year deltas', () => {
    expect(formatRelativeTime(Date.now() - 365 * 24 * 60 * 60 * 1000)).toBe('1y ago');
    expect(formatRelativeTime(Date.now() - 730 * 24 * 60 * 60 * 1000)).toBe('2y ago');
  });

  it('parses an ISO string the same as a number', () => {
    const iso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('5m ago');
  });
});

// ─── providerLabel ──────────────────────────────────────────────────────────

describe('providerLabel', () => {
  it('returns the abbreviated label for known providers', () => {
    expect(providerLabel('aws')).toBe('AWS');
    expect(providerLabel('AWS')).toBe('AWS');
    expect(providerLabel('gcp')).toBe('GCP');
    expect(providerLabel('digitalocean')).toBe('DO');
    expect(providerLabel('oci')).toBe('Oracle');
  });

  it('uppercases an unknown provider as the fallback', () => {
    expect(providerLabel('mycloud')).toBe('MYCLOUD');
  });
});

describe('PROVIDER_LABELS', () => {
  it('exports a label for the seven known providers', () => {
    expect(Object.keys(PROVIDER_LABELS).sort()).toEqual([
      'alibaba',
      'aws',
      'azure',
      'cloudflare',
      'digitalocean',
      'gcp',
      'oci',
    ]);
  });
});
