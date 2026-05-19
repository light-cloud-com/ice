/**
 * rf-canv-2 — pure-predicate regression for the node-classification util.
 *
 * Each predicate folds an inline duplication that previously lived in
 * `svg-canvas.tsx`. These tests pin the verbatim semantics of every
 * predicate so the orchestrator file can keep calling them without
 * subtly drifting away from the original inline checks.
 *
 * No React, no Redux — just shape-tests on plain objects.
 */

import { describe, it, expect } from 'vitest';
import {
  isVpcOrSubnet,
  isPrivateNetwork,
  isContainerIceType,
  isLogIceType,
  isGroupContainer,
  isContainerNode,
  isGroupOrBlock,
} from '../node-classification';

describe('isVpcOrSubnet', () => {
  it('returns true for Network.VPC', () => {
    expect(isVpcOrSubnet('Network.VPC')).toBe(true);
  });

  it('returns true for Network.Subnet', () => {
    expect(isVpcOrSubnet('Network.Subnet')).toBe(true);
  });

  it('returns false for Network.PrivateNetwork', () => {
    expect(isVpcOrSubnet('Network.PrivateNetwork')).toBe(false);
  });

  it('returns false for Network.PublicEndpoint', () => {
    expect(isVpcOrSubnet('Network.PublicEndpoint')).toBe(false);
  });

  it('returns false for Compute.Service', () => {
    expect(isVpcOrSubnet('Compute.Service')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isVpcOrSubnet('')).toBe(false);
  });

  it('returns false for case-shifted near-match', () => {
    expect(isVpcOrSubnet('network.vpc')).toBe(false);
  });
});

describe('isPrivateNetwork', () => {
  it('returns true for Network.PrivateNetwork', () => {
    expect(isPrivateNetwork('Network.PrivateNetwork')).toBe(true);
  });

  it('returns false for Network.VPC', () => {
    expect(isPrivateNetwork('Network.VPC')).toBe(false);
  });

  it('returns false for Network.Subnet', () => {
    expect(isPrivateNetwork('Network.Subnet')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isPrivateNetwork('')).toBe(false);
  });

  it('returns false for unrelated iceType', () => {
    expect(isPrivateNetwork('Compute.Container')).toBe(false);
  });
});

describe('isContainerIceType', () => {
  it('returns true for Network.VPC', () => {
    expect(isContainerIceType('Network.VPC')).toBe(true);
  });

  it('returns true for Network.Subnet', () => {
    expect(isContainerIceType('Network.Subnet')).toBe(true);
  });

  it('returns true for Network.PrivateNetwork', () => {
    expect(isContainerIceType('Network.PrivateNetwork')).toBe(true);
  });

  it('returns false for Network.PublicEndpoint', () => {
    expect(isContainerIceType('Network.PublicEndpoint')).toBe(false);
  });

  it('returns false for Compute.Container', () => {
    expect(isContainerIceType('Compute.Container')).toBe(false);
  });

  it('returns false for Group.Foo', () => {
    // Group.* is folded in by isGroupContainer / isContainerNode at the
    // call site, NOT by isContainerIceType. The original L546 site OR'd
    // a separate startsWith('Group.') check next to this predicate, and
    // the dedup must preserve that split.
    expect(isContainerIceType('Group.Foo')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isContainerIceType('')).toBe(false);
  });
});

describe('isLogIceType', () => {
  it('returns true for Monitoring.Log', () => {
    expect(isLogIceType('Monitoring.Log')).toBe(true);
  });

  it('returns true for Observability.Logs', () => {
    expect(isLogIceType('Observability.Logs')).toBe(true);
  });

  it('returns true for Log.Generic', () => {
    expect(isLogIceType('Log.Generic')).toBe(true);
  });

  it('returns true for any Log.* prefix', () => {
    expect(isLogIceType('Log.Stream')).toBe(true);
    expect(isLogIceType('Log.')).toBe(true);
  });

  it('returns false for Monitoring.Metric', () => {
    expect(isLogIceType('Monitoring.Metric')).toBe(false);
  });

  it('returns false for Network.VPC', () => {
    expect(isLogIceType('Network.VPC')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isLogIceType('')).toBe(false);
  });
});

describe('isGroupContainer', () => {
  it('returns true for Group.* iceType', () => {
    expect(isGroupContainer({ data: { iceType: 'Group.Foo' } })).toBe(true);
  });

  it('returns true for type=container', () => {
    expect(isGroupContainer({ type: 'container' })).toBe(true);
  });

  it('returns true for type=group via the as-any cast', () => {
    expect(isGroupContainer({ type: 'group' })).toBe(true);
  });

  it('returns true for Network.PrivateNetwork (subsumed)', () => {
    expect(isGroupContainer({ data: { iceType: 'Network.PrivateNetwork' } })).toBe(true);
  });

  it('returns false for type=block with non-container iceType', () => {
    expect(isGroupContainer({ data: { iceType: 'Compute.Service' }, type: 'block' })).toBe(false);
  });

  it('returns false for type=resource with non-container iceType', () => {
    expect(isGroupContainer({ data: { iceType: 'Compute.Service' }, type: 'resource' })).toBe(false);
  });

  it('returns false for Network.VPC (NOT subsumed — that is a separate predicate)', () => {
    // The L414 inline derivation only OR'd in PrivateNetwork — NOT VPC/Subnet.
    // Preserve verbatim.
    expect(isGroupContainer({ data: { iceType: 'Network.VPC' } })).toBe(false);
    expect(isGroupContainer({ data: { iceType: 'Network.Subnet' } })).toBe(false);
  });

  it('returns false when data is missing and type is not container/group', () => {
    expect(isGroupContainer({ type: 'block' })).toBe(false);
  });

  it('returns false on empty object', () => {
    expect(isGroupContainer({})).toBe(false);
  });
});

describe('isContainerNode', () => {
  it('returns true for type=container', () => {
    expect(isContainerNode({ type: 'container' })).toBe(true);
  });

  it('returns true for type=group via the as-any cast', () => {
    expect(isContainerNode({ type: 'group' })).toBe(true);
  });

  it('returns true for Network.VPC iceType', () => {
    expect(isContainerNode({ type: 'resource', data: { iceType: 'Network.VPC' } })).toBe(true);
  });

  it('returns true for Network.Subnet iceType', () => {
    expect(isContainerNode({ type: 'resource', data: { iceType: 'Network.Subnet' } })).toBe(true);
  });

  it('returns true for Network.PrivateNetwork iceType', () => {
    expect(isContainerNode({ type: 'resource', data: { iceType: 'Network.PrivateNetwork' } })).toBe(true);
  });

  it('returns false for Group.* iceType (NOT subsumed — L1488 verbatim)', () => {
    // The L1488 useCallback predicate did NOT include `iceType.startsWith('Group.')`.
    // Preserve verbatim — the canvas-edge filter at L546 OR'd that check separately.
    expect(isContainerNode({ type: 'block', data: { iceType: 'Group.Foo' } })).toBe(false);
  });

  it('returns false for type=block with non-container iceType', () => {
    expect(isContainerNode({ type: 'block', data: { iceType: 'Compute.Service' } })).toBe(false);
  });

  it('returns false for type=resource with non-container iceType', () => {
    expect(isContainerNode({ type: 'resource', data: { iceType: 'Compute.Service' } })).toBe(false);
  });

  it('returns false on empty object', () => {
    expect(isContainerNode({})).toBe(false);
  });
});

describe('isGroupOrBlock', () => {
  it('returns true for type=container', () => {
    expect(isGroupOrBlock({ type: 'container' })).toBe(true);
  });

  it('returns true for type=block', () => {
    expect(isGroupOrBlock({ type: 'block' })).toBe(true);
  });

  it('returns true for Group.* iceType', () => {
    expect(isGroupOrBlock({ type: 'resource', data: { iceType: 'Group.Foo' } })).toBe(true);
  });

  it('returns false for Network.PrivateNetwork (NOT subsumed — L1139 verbatim)', () => {
    // The L1139 inline derivation excluded Network.PrivateNetwork — only
    // container/block types and Group.* iceType matter for the empty-container
    // height calc. Preserve verbatim.
    expect(isGroupOrBlock({ type: 'resource', data: { iceType: 'Network.PrivateNetwork' } })).toBe(false);
  });

  it('returns false for Network.VPC', () => {
    expect(isGroupOrBlock({ type: 'resource', data: { iceType: 'Network.VPC' } })).toBe(false);
  });

  it('returns false for type=resource with non-Group iceType', () => {
    expect(isGroupOrBlock({ type: 'resource', data: { iceType: 'Compute.Service' } })).toBe(false);
  });

  it('returns false for type=group (NOT subsumed — L1139 used block/container only)', () => {
    // The L1139 inline check tested `node.type === 'container' || node.type === 'block'`
    // — NOT 'group'. Preserve verbatim.
    expect(isGroupOrBlock({ type: 'group' })).toBe(false);
  });

  it('returns false on empty object', () => {
    expect(isGroupOrBlock({})).toBe(false);
  });
});
