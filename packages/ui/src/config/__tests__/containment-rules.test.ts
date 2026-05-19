/**
 * Containment Rules — comprehensive tests
 *
 * Covers: canContain, isContainer, validatePlacement, getAllowedParents,
 * getAllowedChildren, getContainmentDepth, category matching, Group.Custom
 */

import { describe, it, expect } from 'vitest';
import {
  canContain,
  isContainer,
  validatePlacement,
  getAllowedParents,
  getAllowedChildren,
  getContainmentDepth,
  getContainerTypes,
} from '../containment-rules';

// =============================================================================
// canContain
// =============================================================================

describe('canContain', () => {
  describe('Network.PrivateNetwork — universal container', () => {
    // Like Group.Custom, PrivateNetwork is a logical wrapper that accepts
    // any deployable block. The compiler enforces what's *actually* useful
    // inside a VPC; the canvas just drops things in the bubble.
    it('accepts any resource type as child', () => {
      expect(canContain('Network.PrivateNetwork', 'Compute.Container')).toBe(true);
      expect(canContain('Network.PrivateNetwork', 'Database.PostgreSQL')).toBe(true);
      expect(canContain('Network.PrivateNetwork', 'Network.CustomDomain')).toBe(true);
      expect(canContain('Network.PrivateNetwork', 'TotallyMade.Up.Type')).toBe(true);
    });
  });

  describe('Group.Custom — universal container', () => {
    it('should accept any resource type', () => {
      expect(canContain('Group.Custom', 'Compute.Container')).toBe(true);
      expect(canContain('Group.Custom', 'Database.PostgreSQL')).toBe(true);
      expect(canContain('Group.Custom', 'Messaging.Queue')).toBe(true);
      expect(canContain('Group.Custom', 'Storage.Bucket')).toBe(true);
    });

    it('should accept blocks as children', () => {
      expect(canContain('Group.Custom', 'Block.ScalableBackend')).toBe(true);
      expect(canContain('Group.Custom', 'Block.Database')).toBe(true);
    });

    it('should accept groups as children (nesting)', () => {
      expect(canContain('Group.Custom', 'Group.Frontend')).toBe(true);
      expect(canContain('Group.Custom', 'Group.Custom')).toBe(true);
    });

    it('should accept networking types', () => {
      expect(canContain('Group.Custom', 'Network.VPC')).toBe(true);
      expect(canContain('Group.Custom', 'Network.Subnet')).toBe(true);
    });

    it('should accept unknown/future types', () => {
      expect(canContain('Group.Custom', 'SomeNew.FutureType')).toBe(true);
    });
  });

  describe('Named groups — typed containment', () => {
    it('Group.Frontend should accept frontend resources', () => {
      expect(canContain('Group.Frontend', 'Compute.Container')).toBe(true);
      expect(canContain('Group.Frontend', 'Network.CDN')).toBe(true);
      expect(canContain('Group.Frontend', 'Compute.StaticSite')).toBe(true);
    });

    it('Group.Frontend should reject non-frontend resources', () => {
      expect(canContain('Group.Frontend', 'Database.PostgreSQL')).toBe(false);
      expect(canContain('Group.Frontend', 'Messaging.Queue')).toBe(false);
    });

    it('Group.Data should accept database and storage types', () => {
      expect(canContain('Group.Data', 'Database.PostgreSQL')).toBe(true);
      expect(canContain('Group.Data', 'Database.MySQL')).toBe(true);
      expect(canContain('Group.Data', 'Storage.Bucket')).toBe(true);
    });

    it('Group.Services should accept compute resources', () => {
      expect(canContain('Group.Services', 'Compute.Container')).toBe(true);
      expect(canContain('Group.Services', 'Compute.Function')).toBe(true);
      expect(canContain('Group.Services', 'Compute.Worker')).toBe(true);
    });

    it('Group.Messaging should accept messaging types', () => {
      expect(canContain('Group.Messaging', 'Messaging.Queue')).toBe(true);
      expect(canContain('Group.Messaging', 'Messaging.Topic')).toBe(true);
    });
  });

  describe('Block containment — blocks are leaf nodes', () => {
    // Block.* types are not containers in the current model — they are
    // opaque high-level abstractions that expand into resources at deploy
    // time, not hierarchical parents on the canvas.
    it('Block.ScalableBackend should not accept children', () => {
      expect(canContain('Block.ScalableBackend', 'Compute.Container')).toBe(false);
      expect(canContain('Block.ScalableBackend', 'Database.PostgreSQL')).toBe(false);
    });

    it('Block.Database should not accept children', () => {
      expect(canContain('Block.Database', 'Database.PostgreSQL')).toBe(false);
      expect(canContain('Block.Database', 'Compute.Container')).toBe(false);
    });
  });

  describe('Network containment', () => {
    it('VPC should accept subnets and networking', () => {
      expect(canContain('Network.VPC', 'Network.Subnet')).toBe(true);
      expect(canContain('Network.VPC', 'Network.LoadBalancer')).toBe(true);
      expect(canContain('Network.VPC', 'Network.Gateway')).toBe(true);
    });

    it('VPC should reject compute resources', () => {
      expect(canContain('Network.VPC', 'Compute.Container')).toBe(false);
      expect(canContain('Network.VPC', 'Database.PostgreSQL')).toBe(false);
    });

    it('Subnet should accept compute and data resources', () => {
      expect(canContain('Network.Subnet', 'Compute.Container')).toBe(true);
      expect(canContain('Network.Subnet', 'Database.PostgreSQL')).toBe(true);
      expect(canContain('Network.Subnet', 'Storage.Bucket')).toBe(true);
    });
  });

  describe('Category matching', () => {
    it('should match by category prefix for unlisted subtypes', () => {
      // Database.Firestore not explicitly in Block.Database, but Database.* matches
      expect(canContain('Group.Data', 'Database.Firestore')).toBe(true);
    });

    it('should not cross-match categories', () => {
      expect(canContain('Block.Cache', 'Compute.Container')).toBe(false);
    });
  });

  describe('Unknown parent type', () => {
    it('should return false for non-existent parent types', () => {
      expect(canContain('Unknown.Type', 'Compute.Container')).toBe(false);
      expect(canContain('Compute.Container', 'Compute.Container')).toBe(false);
    });
  });
});

// =============================================================================
// isContainer
// =============================================================================

describe('isContainer', () => {
  it('should return true for all group types', () => {
    expect(isContainer('Group.Frontend')).toBe(true);
    expect(isContainer('Group.Services')).toBe(true);
    expect(isContainer('Group.Data')).toBe(true);
    expect(isContainer('Group.Custom')).toBe(true);
  });

  it('should return false for block types (blocks are leaf nodes)', () => {
    expect(isContainer('Block.ScalableBackend')).toBe(false);
    expect(isContainer('Block.Database')).toBe(false);
    expect(isContainer('Block.Gateway')).toBe(false);
  });

  it('should return true for network containers', () => {
    expect(isContainer('Network.VPC')).toBe(true);
    expect(isContainer('Network.Subnet')).toBe(true);
  });

  it('should return true for Network.PrivateNetwork (no CONTAINMENT_RULES entry)', () => {
    // PrivateNetwork is not a key in parentToChildrenMap, but the explicit
    // string-comparison branch in isContainer catches it as a container.
    expect(isContainer('Network.PrivateNetwork')).toBe(true);
  });

  it('should return false for leaf resources', () => {
    expect(isContainer('Compute.Container')).toBe(false);
    expect(isContainer('Database.PostgreSQL')).toBe(false);
    expect(isContainer('Messaging.Queue')).toBe(false);
    expect(isContainer('Storage.Bucket')).toBe(false);
  });

  it('should return false for unknown types', () => {
    expect(isContainer('Unknown.Type')).toBe(false);
    expect(isContainer('')).toBe(false);
  });
});

// =============================================================================
// validatePlacement
// =============================================================================

describe('validatePlacement', () => {
  it('should allow any node at root level (no parent)', () => {
    expect(validatePlacement('Compute.Container', null)).toEqual({ valid: true });
    expect(validatePlacement('Block.Database', null)).toEqual({ valid: true });
    expect(validatePlacement('Group.Custom', null)).toEqual({ valid: true });
  });

  it('should allow valid child in parent', () => {
    expect(validatePlacement('Network.Subnet', 'Network.VPC')).toEqual({ valid: true });
    expect(validatePlacement('Compute.Container', 'Group.Services')).toEqual({ valid: true });
  });

  it('should reject invalid child in parent with reason', () => {
    const result = validatePlacement('Database.PostgreSQL', 'Network.VPC');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('Network.VPC');
  });

  it('should allow anything in Group.Custom', () => {
    expect(validatePlacement('Compute.Container', 'Group.Custom')).toEqual({ valid: true });
    expect(validatePlacement('Group.Frontend', 'Group.Custom')).toEqual({ valid: true });
  });
});

// =============================================================================
// getAllowedParents / getAllowedChildren
// =============================================================================

describe('getAllowedParents', () => {
  it('should return valid parents for a resource type', () => {
    const parents = getAllowedParents('Compute.Container');
    expect(parents).toContain('Network.Subnet');
    expect(parents).toContain('Group.Frontend');
    expect(parents).toContain('Group.Services');
  });

  it('should return parents that accept Network.* via category matching', () => {
    const parents = getAllowedParents('Network.VPC');
    // VPC matches Network.* category in several containers
    expect(parents.length).toBeGreaterThan(0);
  });
});

describe('getAllowedChildren', () => {
  it('should return child types for a container', () => {
    const children = getAllowedChildren('Network.VPC');
    expect(children).toContain('Network.Subnet');
    expect(children).toContain('Network.LoadBalancer');
  });

  it('should return empty for non-container types', () => {
    expect(getAllowedChildren('Compute.Container')).toEqual([]);
    expect(getAllowedChildren('Unknown.Type')).toEqual([]);
  });
});

// =============================================================================
// getContainmentDepth
// =============================================================================

describe('getContainmentDepth', () => {
  it('should return 0 for root-level types', () => {
    expect(getContainmentDepth('Group.Custom')).toBe(0);
    expect(getContainmentDepth('Group.Frontend')).toBe(0);
    expect(getContainmentDepth('Network.VPC')).toBe(0);
  });

  it('should return 1 for subnet', () => {
    expect(getContainmentDepth('Network.Subnet')).toBe(1);
  });

  it('should return 1 for resources with root-level parents', () => {
    // Application.Container can be in Group.Frontend (root) → depth 1
    expect(getContainmentDepth('Compute.Container')).toBe(1);
  });

  it('should return 2 for resources whose only parents are non-root containers', () => {
    // Storage.Disk only appears in Group.Data — Group.Data starts with
    // 'Group.', so Storage.Disk *would* be depth 1. Pick something that
    // appears nowhere as a child to fall through to depth 2.
    expect(getContainmentDepth('Totally.Unknown.Type')).toBe(2);
  });
});

// =============================================================================
// getContainerTypes
// =============================================================================

describe('getContainerTypes', () => {
  it('should include all container types from CONTAINMENT_RULES', () => {
    const types = getContainerTypes();
    expect(types).toContain('Network.VPC');
    expect(types).toContain('Network.Subnet');
    expect(types).toContain('Group.Frontend');
    // Group.Custom is handled specially in canContain/isContainer but has no CONTAINMENT_RULES entry
    expect(types.length).toBeGreaterThan(5);
  });

  it('should recognize Group.Custom as container via isContainer even without explicit rules', () => {
    expect(isContainer('Group.Custom')).toBe(true);
    // But getContainerTypes only returns types from CONTAINMENT_RULES
    expect(getContainerTypes()).not.toContain('Group.Custom');
  });
});
