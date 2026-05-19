/**
 * Tests for GCP relationship inference (relationships.ts).
 *
 * Pure functions — exercises the recursive scanner + the partial/full
 * self_link match paths + every relationship-type discriminator.
 */

import { describe, it, expect } from 'vitest';
import { infer_relationships, get_relationship_type } from '../relationships';
import type { GCPImportedResource, GCPImportWarning } from '../types';

function res(partial: Partial<GCPImportedResource>): GCPImportedResource {
  return {
    gcp_self_link: '',
    gcp_kind: 'compute#instance',
    ice_type: 'Compute.Container',
    name: 'n',
    id: 'i',
    properties: {},
    dependencies: [],
    provider: 'gcp',
    project: 'p',
    labels: {},
    ...partial,
  };
}

describe('infer_relationships — full self_link match', () => {
  it('records the dep when a property contains a full https:// self_link of another resource', () => {
    const network = res({
      gcp_kind: 'compute#network',
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/global/networks/default',
      name: 'default',
    });
    const instance = res({
      gcp_kind: 'compute#instance',
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/zones/us-central1-a/instances/i1',
      name: 'i1',
      properties: {
        networkInterfaces: [
          { network: 'https://compute.googleapis.com/compute/v1/projects/p/global/networks/default' },
        ],
      },
    });

    const warnings: GCPImportWarning[] = [];
    infer_relationships([network, instance], warnings);

    expect(instance.dependencies).toContain(network.gcp_self_link);
    expect(network.dependencies).toEqual([]); // no deps in the empty-properties resource
  });
});

describe('infer_relationships — partial-format match', () => {
  it('matches a `projects/...` partial reference back to a full-URL self_link', () => {
    const subnet = res({
      gcp_kind: 'compute#subnetwork',
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/regions/us-central1/subnetworks/sn',
    });
    const instance = res({
      gcp_kind: 'compute#instance',
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/zones/us-central1-a/instances/i',
      properties: {
        // Reference using projects/... partial form (also is_gcp_reference true)
        subnet: 'projects/p/regions/us-central1/subnetworks/sn',
      },
    });

    infer_relationships([subnet, instance], []);

    // Full self_link is added (the partial map points at the same resource)
    expect(instance.dependencies).toContain(subnet.gcp_self_link);
  });
});

describe('infer_relationships — non-references and structural traversal', () => {
  it('does not add deps for plain strings that are not GCP references', () => {
    const a = res({ gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/foo/a' });
    const b = res({
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/foo/b',
      properties: { description: 'just a label, no api host', tags: ['web', 'prod'] },
    });
    infer_relationships([a, b], []);
    expect(b.dependencies).toEqual([]);
  });

  it('walks arrays and nested objects looking for references', () => {
    const target = res({
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/x/target',
    });
    const owner = res({
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/x/owner',
      properties: {
        nested: {
          deep: {
            list: [{ ref: 'https://compute.googleapis.com/compute/v1/projects/p/x/target' }],
          },
        },
      },
    });
    infer_relationships([target, owner], []);
    expect(owner.dependencies).toContain(target.gcp_self_link);
  });

  it('skips null and undefined property values', () => {
    const a = res({
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/a',
      properties: { x: null, y: undefined },
    });
    expect(() => infer_relationships([a], [])).not.toThrow();
  });

  it('skips resources with empty self_link (excluded from the lookup map)', () => {
    const noLink = res({ gcp_self_link: '' });
    const ref = res({
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/x/ref',
      properties: { sib: '' },
    });
    infer_relationships([noLink, ref], []);
    // Empty-string self_link never made it into the map, no lookups succeed
    expect(ref.dependencies).toEqual([]);
  });

  it('does not duplicate an existing dependency', () => {
    const t = res({ gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/t' });
    const o = res({
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/o',
      dependencies: ['https://compute.googleapis.com/compute/v1/projects/p/t'],
      properties: { a: 'https://compute.googleapis.com/compute/v1/projects/p/t' },
    });
    infer_relationships([t, o], []);
    expect(o.dependencies.filter((d) => d === t.gcp_self_link)).toHaveLength(1);
  });
});

describe('infer_relationships — is_gcp_reference triggers', () => {
  // Each branch of the is_gcp_reference test ladder
  const cases: Array<[string, string]> = [
    ['compute', 'https://compute.googleapis.com/compute/v1/projects/p/c/x'],
    ['storage', 'https://storage.googleapis.com/storage/v1/b/x'],
    ['sqladmin', 'https://sqladmin.googleapis.com/sql/v1beta4/projects/p/instances/x'],
    ['container', 'https://container.googleapis.com/v1/projects/p/clusters/x'],
    ['iam', 'https://iam.googleapis.com/v1/projects/p/serviceAccounts/x'],
    ['projects-prefix', 'projects/p/locations/us/services/x'],
    ['googleapis-prefix', 'https://www.googleapis.com/compute/v1/projects/p/x'],
  ];
  for (const [label, refValue] of cases) {
    it(`recognises a ${label} reference and finds the matching self_link`, () => {
      const target = res({ gcp_self_link: refValue });
      const owner = res({
        gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/owner',
        properties: { ref: refValue },
      });
      infer_relationships([target, owner], []);
      expect(owner.dependencies).toContain(target.gcp_self_link);
    });
  }
});

describe('infer_relationships — partial-fallback after exact-link miss', () => {
  it('matches via the projects/... partial when the full URL has a different host', () => {
    // The target's self_link is a "v2" host, the reference uses "v1" — exact miss.
    // But `extract_partial_self_link` reduces both to the same `projects/...` form.
    const target = res({
      gcp_self_link: 'https://compute.googleapis.com/compute/v2/projects/p/zones/us-central1-a/instances/special',
    });
    const owner = res({
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/owner',
      properties: {
        ref: 'https://compute.googleapis.com/compute/v1/projects/p/zones/us-central1-a/instances/special',
      },
    });
    infer_relationships([target, owner], []);
    expect(owner.dependencies).toContain(target.gcp_self_link);
  });

  it('does not add a dep when the partial form has no matching resource', () => {
    const owner = res({
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/owner',
      properties: {
        ref: 'https://compute.googleapis.com/compute/v1/projects/p/zones/us-central1-a/instances/missing',
      },
    });
    infer_relationships([owner], []);
    expect(owner.dependencies).toEqual([]);
  });
});

describe('infer_relationships — partial-link extraction failure path', () => {
  it('falls back when the reference cannot be reduced to a partial self_link', () => {
    // is_gcp_reference returns true (host match) but the URL has no /projects/ segment,
    // so extract_partial_self_link returns null. No dependency is added.
    const owner = res({
      gcp_self_link: 'https://compute.googleapis.com/compute/v1/projects/p/owner',
      properties: { ref: 'https://compute.googleapis.com/no-projects-segment-here' },
    });
    infer_relationships([owner], []);
    expect(owner.dependencies).toEqual([]);
  });
});

// =========================================================================
// get_relationship_type
// =========================================================================

describe('get_relationship_type', () => {
  it('compute#instance → compute#network is depends_on', () => {
    expect(get_relationship_type('compute#instance', 'compute#network')).toBe('depends_on');
  });
  it('compute#instance → compute#subnetwork is depends_on', () => {
    expect(get_relationship_type('compute#instance', 'compute#subnetwork')).toBe('depends_on');
  });
  it('compute#instance → compute#disk is depends_on', () => {
    expect(get_relationship_type('compute#instance', 'compute#disk')).toBe('depends_on');
  });
  it('compute#instance → unrelated kind falls through to references', () => {
    expect(get_relationship_type('compute#instance', 'storage#bucket')).toBe('references');
  });
  it('compute#subnetwork → compute#network is depends_on', () => {
    expect(get_relationship_type('compute#subnetwork', 'compute#network')).toBe('depends_on');
  });
  it('compute#firewall → compute#network is depends_on', () => {
    expect(get_relationship_type('compute#firewall', 'compute#network')).toBe('depends_on');
  });
  it('container#cluster → compute#network is depends_on', () => {
    expect(get_relationship_type('container#cluster', 'compute#network')).toBe('depends_on');
  });
  it('container#cluster → compute#subnetwork is depends_on', () => {
    expect(get_relationship_type('container#cluster', 'compute#subnetwork')).toBe('depends_on');
  });
  it('container#cluster → unrelated kind falls through to references', () => {
    expect(get_relationship_type('container#cluster', 'storage#bucket')).toBe('references');
  });
  it('default — any unknown source/target combination is references', () => {
    expect(get_relationship_type('storage#bucket', 'compute#instance')).toBe('references');
  });
});
