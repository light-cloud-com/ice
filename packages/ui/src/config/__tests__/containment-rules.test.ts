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
  describe('Group.Custom — universal container', () => {
    it('should accept any resource type', () => {
      expect(canContain('Group.Custom', 'Application.Container')).toBe(true);
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
      expect(canContain('Group.Frontend', 'Application.Container')).toBe(true);
      expect(canContain('Group.Frontend', 'Network.CDN')).toBe(true);
      expect(canContain('Group.Frontend', 'Block.StaticSite')).toBe(true);
    });

    it('Group.Frontend should reject non-frontend resources', () => {
      expect(canContain('Group.Frontend', 'Database.PostgreSQL')).toBe(false);
      expect(canContain('Group.Frontend', 'Messaging.Queue')).toBe(false);
    });

    it('Group.Data should accept database and storage types', () => {
      expect(canContain('Group.Data', 'Database.PostgreSQL')).toBe(true);
      expect(canContain('Group.Data', 'Database.MySQL')).toBe(true);
      expect(canContain('Group.Data', 'Storage.Bucket')).toBe(true);
      expect(canContain('Group.Data', 'Block.Database')).toBe(true);
    });

    it('Group.Services should accept compute blocks', () => {
      expect(canContain('Group.Services', 'Block.ScalableBackend')).toBe(true);
      expect(canContain('Group.Services', 'Block.Worker')).toBe(true);
      expect(canContain('Group.Services', 'Application.Container')).toBe(true);
    });

    it('Group.Messaging should accept messaging types', () => {
      expect(canContain('Group.Messaging', 'Messaging.Queue')).toBe(true);
      expect(canContain('Group.Messaging', 'Block.Queue')).toBe(true);
    });
  });

  describe('Block containment — strict rules', () => {
    it('Block.ScalableBackend should accept compute and database', () => {
      expect(canContain('Block.ScalableBackend', 'Application.Container')).toBe(true);
      expect(canContain('Block.ScalableBackend', 'Database.PostgreSQL')).toBe(true);
      expect(canContain('Block.ScalableBackend', 'Messaging.Queue')).toBe(true);
    });

    it('Block.ScalableBackend should reject unrelated types', () => {
      expect(canContain('Block.ScalableBackend', 'Storage.Bucket')).toBe(false);
      expect(canContain('Block.ScalableBackend', 'Security.Secret')).toBe(false);
    });

    it('Block.Database should accept only database resources', () => {
      expect(canContain('Block.Database', 'Database.PostgreSQL')).toBe(true);
      expect(canContain('Block.Database', 'Database.MySQL')).toBe(true);
      expect(canContain('Block.Database', 'Application.Container')).toBe(false);
    });

    it('Block.Cache should accept cache instances', () => {
      expect(canContain('Block.Cache', 'Database.Redis')).toBe(true);
      expect(canContain('Block.Cache', 'Database.Memcached')).toBe(true);
    });

    it('Block.Cache should reject non-Database types', () => {
      expect(canContain('Block.Cache', 'Application.Container')).toBe(false);
      expect(canContain('Block.Cache', 'Storage.Bucket')).toBe(false);
      expect(canContain('Block.Cache', 'Messaging.Queue')).toBe(false);
    });
  });

  describe('Network containment', () => {
    it('VPC should accept subnets and networking', () => {
      expect(canContain('Network.VPC', 'Network.Subnet')).toBe(true);
      expect(canContain('Network.VPC', 'Network.LoadBalancer')).toBe(true);
      expect(canContain('Network.VPC', 'Network.Gateway')).toBe(true);
    });

    it('VPC should reject compute resources', () => {
      expect(canContain('Network.VPC', 'Application.Container')).toBe(false);
      expect(canContain('Network.VPC', 'Database.PostgreSQL')).toBe(false);
    });

    it('Subnet should accept compute and data resources', () => {
      expect(canContain('Network.Subnet', 'Application.Container')).toBe(true);
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
      expect(canContain('Block.Cache', 'Application.Container')).toBe(false);
    });
  });

  describe('Unknown parent type', () => {
    it('should return false for non-existent parent types', () => {
      expect(canContain('Unknown.Type', 'Application.Container')).toBe(false);
      expect(canContain('Application.Container', 'Application.Container')).toBe(false);
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

  it('should return true for block types', () => {
    expect(isContainer('Block.ScalableBackend')).toBe(true);
    expect(isContainer('Block.Database')).toBe(true);
    expect(isContainer('Block.Gateway')).toBe(true);
  });

  it('should return true for network containers', () => {
    expect(isContainer('Network.VPC')).toBe(true);
    expect(isContainer('Network.Subnet')).toBe(true);
  });

  it('should return false for leaf resources', () => {
    expect(isContainer('Application.Container')).toBe(false);
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
    expect(validatePlacement('Application.Container', null)).toEqual({ valid: true });
    expect(validatePlacement('Block.Database', null)).toEqual({ valid: true });
    expect(validatePlacement('Group.Custom', null)).toEqual({ valid: true });
  });

  it('should allow valid child in parent', () => {
    expect(validatePlacement('Network.Subnet', 'Network.VPC')).toEqual({ valid: true });
    expect(validatePlacement('Application.Container', 'Block.ScalableBackend')).toEqual({ valid: true });
  });

  it('should reject invalid child in parent with reason', () => {
    const result = validatePlacement('Database.PostgreSQL', 'Network.VPC');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('Network.VPC');
  });

  it('should allow anything in Group.Custom', () => {
    expect(validatePlacement('Application.Container', 'Group.Custom')).toEqual({ valid: true });
    expect(validatePlacement('Group.Frontend', 'Group.Custom')).toEqual({ valid: true });
  });
});

// =============================================================================
// getAllowedParents / getAllowedChildren
// =============================================================================

describe('getAllowedParents', () => {
  it('should return valid parents for a resource type', () => {
    const parents = getAllowedParents('Application.Container');
    expect(parents).toContain('Network.Subnet');
    expect(parents).toContain('Block.ScalableBackend');
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
    expect(getAllowedChildren('Application.Container')).toEqual([]);
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
    expect(getContainmentDepth('Block.ScalableBackend')).toBe(0);
    expect(getContainmentDepth('Network.VPC')).toBe(0);
  });

  it('should return 1 for subnet', () => {
    expect(getContainmentDepth('Network.Subnet')).toBe(1);
  });

  it('should return 1 for resources with root-level parents', () => {
    // Application.Container can be in Group.Frontend (root) → depth 1
    expect(getContainmentDepth('Application.Container')).toBe(1);
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
    expect(types).toContain('Block.ScalableBackend');
    expect(types).toContain('Group.Frontend');
    // Group.Custom is handled specially in canContain/isContainer but has no CONTAINMENT_RULES entry
    expect(types.length).toBeGreaterThan(10);
  });

  it('should recognize Group.Custom as container via isContainer even without explicit rules', () => {
    expect(isContainer('Group.Custom')).toBe(true);
    // But getContainerTypes only returns types from CONTAINMENT_RULES
    expect(getContainerTypes()).not.toContain('Group.Custom');
  });
});
