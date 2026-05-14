/**
 * Tests for `edge-classifier.ts` — node/edge deployability predicates.
 *
 * Covers:
 *   - `UI_ONLY_TYPES`, `SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS`,
 *     `EXTERNAL_TYPES` Set membership (positive + negative cases).
 *   - `hasPrivateNetworkAncestor` chain walk semantics including
 *     cycle protection and missing-parent fallthrough.
 *   - `isCustomDomainStandalone` mode resolution for the CustomDomain
 *     two-mode contract.
 *   - `map_edge_relationship` — explicit pin on the `default → 'connects_to'`
 *     branch (RISK #2 from the rf-ctrans blueprint: this is the resolved
 *     value for every unannotated edge, not a throw).
 */
import { describe, it, expect } from 'vitest';
import {
  UI_ONLY_TYPES,
  SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS,
  EXTERNAL_TYPES,
  hasPrivateNetworkAncestor,
  isCustomDomainStandalone,
  map_edge_relationship,
} from '../edge-classifier';

describe('UI_ONLY_TYPES', () => {
  it('contains exactly 3 entries', () => {
    expect(UI_ONLY_TYPES.size).toBe(3);
  });

  it('includes Source.Repository', () => {
    expect(UI_ONLY_TYPES.has('Source.Repository')).toBe(true);
  });

  it('includes Config.Environment', () => {
    expect(UI_ONLY_TYPES.has('Config.Environment')).toBe(true);
  });

  it('includes Network.PublicTraffic', () => {
    expect(UI_ONLY_TYPES.has('Network.PublicTraffic')).toBe(true);
  });

  it('does NOT include Network.PrivateNetwork (which is deployable)', () => {
    expect(UI_ONLY_TYPES.has('Network.PrivateNetwork')).toBe(false);
  });

  it('does NOT include Compute.Container', () => {
    expect(UI_ONLY_TYPES.has('Compute.Container')).toBe(false);
  });
});

describe('SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS', () => {
  it('contains exactly 5 entries', () => {
    expect(SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS.size).toBe(5);
  });

  it('includes Compute.Container', () => {
    expect(SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS.has('Compute.Container')).toBe(true);
  });

  it('includes Compute.BackendAPI', () => {
    expect(SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS.has('Compute.BackendAPI')).toBe(true);
  });

  it('includes Compute.SSRSite', () => {
    expect(SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS.has('Compute.SSRSite')).toBe(true);
  });

  it('includes Compute.Worker', () => {
    expect(SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS.has('Compute.Worker')).toBe(true);
  });

  it('includes Compute.ServerlessFunction', () => {
    expect(SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS.has('Compute.ServerlessFunction')).toBe(true);
  });

  it('does NOT include Compute.StaticSite (LB-wiring contract: static sites are not service backends)', () => {
    expect(SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS.has('Compute.StaticSite')).toBe(false);
  });
});

describe('EXTERNAL_TYPES', () => {
  it('contains exactly 1 entry', () => {
    expect(EXTERNAL_TYPES.size).toBe(1);
  });

  it('includes Database.MongoDB', () => {
    expect(EXTERNAL_TYPES.has('Database.MongoDB')).toBe(true);
  });

  it('does NOT include Database.PostgreSQL (which is GCP-managed via Cloud SQL)', () => {
    expect(EXTERNAL_TYPES.has('Database.PostgreSQL')).toBe(false);
  });

  it('does NOT include Database.Redis (Memorystore)', () => {
    expect(EXTERNAL_TYPES.has('Database.Redis')).toBe(false);
  });
});

describe('hasPrivateNetworkAncestor', () => {
  it('returns false when node has no parent', () => {
    const node = { id: 'n1', parentId: null };
    expect(hasPrivateNetworkAncestor(node, [])).toBe(false);
  });

  it('returns false when parentId is undefined', () => {
    const node = { id: 'n1' };
    expect(hasPrivateNetworkAncestor(node, [])).toBe(false);
  });

  it('returns true when direct parent has iceType Network.PrivateNetwork', () => {
    const allNodes = [
      { id: 'vpc-1', parentId: null, data: { iceType: 'Network.PrivateNetwork' } },
    ];
    const node = { id: 'svc-1', parentId: 'vpc-1' };
    expect(hasPrivateNetworkAncestor(node, allNodes)).toBe(true);
  });

  it('returns true when grandparent is Network.PrivateNetwork (walks the chain)', () => {
    const allNodes = [
      { id: 'vpc-1', parentId: null, data: { iceType: 'Network.PrivateNetwork' } },
      { id: 'group-1', parentId: 'vpc-1', data: { iceType: 'Layout.Group' } },
    ];
    const node = { id: 'svc-1', parentId: 'group-1' };
    expect(hasPrivateNetworkAncestor(node, allNodes)).toBe(true);
  });

  it('returns false when ancestors are not PrivateNetwork (groups / containers)', () => {
    const allNodes = [
      { id: 'top', parentId: null, data: { iceType: 'Layout.Group' } },
      { id: 'mid', parentId: 'top', data: { iceType: 'Layout.Group' } },
    ];
    const node = { id: 'svc-1', parentId: 'mid' };
    expect(hasPrivateNetworkAncestor(node, allNodes)).toBe(false);
  });

  it('cycle protection: returns false instead of looping when parent chain cycles', () => {
    const allNodes = [
      { id: 'a', parentId: 'b', data: { iceType: 'Layout.Group' } },
      { id: 'b', parentId: 'a', data: { iceType: 'Layout.Group' } },
    ];
    const node = { id: 'svc-1', parentId: 'a' };
    expect(hasPrivateNetworkAncestor(node, allNodes)).toBe(false);
  });

  it('returns false when parentId points to a non-existent node', () => {
    const allNodes = [
      { id: 'unrelated', parentId: null, data: { iceType: 'Layout.Group' } },
    ];
    const node = { id: 'svc-1', parentId: 'missing' };
    expect(hasPrivateNetworkAncestor(node, allNodes)).toBe(false);
  });

  it('walks past non-PrivateNetwork ancestors to find a deeper PrivateNetwork', () => {
    const allNodes = [
      { id: 'vpc-1', parentId: null, data: { iceType: 'Network.PrivateNetwork' } },
      { id: 'sub-1', parentId: 'vpc-1', data: { iceType: 'Network.Subnet' } },
      { id: 'group-1', parentId: 'sub-1', data: { iceType: 'Layout.Group' } },
    ];
    const node = { id: 'svc-1', parentId: 'group-1' };
    expect(hasPrivateNetworkAncestor(node, allNodes)).toBe(true);
  });
});

describe('isCustomDomainStandalone', () => {
  it('returns false for a non-CustomDomain node (regardless of parent)', () => {
    const node = {
      data: { iceType: 'Compute.Container' },
      parentId: null,
    };
    expect(isCustomDomainStandalone(node, [])).toBe(false);
  });

  it('returns false for a non-CustomDomain even when parent exists', () => {
    const allNodes = [
      { id: 'p', data: { iceType: 'Layout.Group' } },
    ];
    const node = {
      data: { iceType: 'Compute.Container' },
      parentId: 'p',
    };
    expect(isCustomDomainStandalone(node, allNodes)).toBe(false);
  });

  it('returns true for a CustomDomain with no parent (parentId null)', () => {
    const node = {
      data: { iceType: 'Network.CustomDomain' },
      parentId: null,
    };
    expect(isCustomDomainStandalone(node, [])).toBe(true);
  });

  it('returns true for a CustomDomain with no parent (parentId undefined)', () => {
    const node = {
      data: { iceType: 'Network.CustomDomain' },
    };
    expect(isCustomDomainStandalone(node, [])).toBe(true);
  });

  it('returns false for a CustomDomain whose parent is a Network.PrivateNetwork (nested mode)', () => {
    const allNodes = [
      { id: 'vpc-1', data: { iceType: 'Network.PrivateNetwork' } },
    ];
    const node = {
      data: { iceType: 'Network.CustomDomain' },
      parentId: 'vpc-1',
    };
    expect(isCustomDomainStandalone(node, allNodes)).toBe(false);
  });

  it('returns true for a CustomDomain whose parent is a generic group (standalone mode)', () => {
    const allNodes = [
      { id: 'group-1', data: { iceType: 'Layout.Group' } },
    ];
    const node = {
      data: { iceType: 'Network.CustomDomain' },
      parentId: 'group-1',
    };
    expect(isCustomDomainStandalone(node, allNodes)).toBe(true);
  });

  it('returns true for a CustomDomain whose parentId points to a missing node (parent undefined → standalone)', () => {
    const node = {
      data: { iceType: 'Network.CustomDomain' },
      parentId: 'missing',
    };
    expect(isCustomDomainStandalone(node, [])).toBe(true);
  });
});

describe('map_edge_relationship', () => {
  it('maps "depends_on" → "depends_on"', () => {
    expect(map_edge_relationship('depends_on')).toBe('depends_on');
  });

  it('maps "contains" → "contains"', () => {
    expect(map_edge_relationship('contains')).toBe('contains');
  });

  it('maps "references" → "references"', () => {
    expect(map_edge_relationship('references')).toBe('references');
  });

  it('maps "connects_to" → "connects_to"', () => {
    expect(map_edge_relationship('connects_to')).toBe('connects_to');
  });

  it('maps "talks_to" → "talks_to"', () => {
    expect(map_edge_relationship('talks_to')).toBe('talks_to');
  });

  // RISK #2 from the rf-ctrans blueprint: the default branch returns
  // 'connects_to' for every unannotated edge. This is NOT a throw —
  // it's the resolved relationship for every unannotated edge in the
  // wild. Pin it explicitly so any refactor that flips the default
  // (e.g. to 'references' or to a throw) trips the test.
  describe('default branch → "connects_to" (RISK #2 — load-bearing for unannotated edges)', () => {
    it('undefined relationship → "connects_to"', () => {
      expect(map_edge_relationship(undefined)).toBe('connects_to');
    });

    it('called with no argument → "connects_to"', () => {
      expect(map_edge_relationship()).toBe('connects_to');
    });

    it('empty string → "connects_to"', () => {
      expect(map_edge_relationship('')).toBe('connects_to');
    });

    it('arbitrary unknown string ("foo") → "connects_to"', () => {
      expect(map_edge_relationship('foo')).toBe('connects_to');
    });

    it('case-mismatched known string ("Depends_On") → "connects_to" (no normalization)', () => {
      expect(map_edge_relationship('Depends_On')).toBe('connects_to');
    });
  });
});
