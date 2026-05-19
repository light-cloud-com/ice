/**
 * rf-aiop-6 — pickNodeDefaults tests.
 *
 * Pin the size table verbatim. The order of branches matters: VPC takes
 * priority over container, container over helper, helper over default,
 * so e.g. a container-typed Network.VPC still gets the VPC default
 * (the `isVpc` ternary fires first).
 */

import { describe, it, expect } from 'vitest';
import { pickNodeDefaults } from '../node-defaults';

describe('rf-aiop-6 pickNodeDefaults', () => {
  it('Network.VPC → 280 x 180 (highest priority)', () => {
    expect(pickNodeDefaults('block', 'Network.VPC')).toEqual({ width: 280, height: 180 });
  });

  it('Network.VPC even when type is container → 280 x 180 (VPC branch wins over container)', () => {
    expect(pickNodeDefaults('container', 'Network.VPC')).toEqual({ width: 280, height: 180 });
  });

  it('Network.Subnet → 260 x 150', () => {
    expect(pickNodeDefaults('block', 'Network.Subnet')).toEqual({ width: 260, height: 150 });
  });

  it('container with non-VPC/non-Subnet iceType → 260 x 150', () => {
    expect(pickNodeDefaults('container', 'Compute.Group')).toEqual({ width: 260, height: 150 });
  });

  it('helper iceType (Security.IAM) on a non-container → HELPER_NODE_WIDTH x HELPER_NODE_HEIGHT (170 x 56)', () => {
    expect(pickNodeDefaults('block', 'Security.IAM')).toEqual({ width: 170, height: 56 });
  });

  it('helper iceType (Monitoring.Log) → 170 x 56', () => {
    expect(pickNodeDefaults('block', 'Monitoring.Log')).toEqual({ width: 170, height: 56 });
  });

  it('default — non-helper non-VPC non-Subnet non-container → NODE_WIDTH x NODE_HEIGHT (220 x 72)', () => {
    expect(pickNodeDefaults('block', 'Compute.Container')).toEqual({ width: 220, height: 72 });
  });

  it('empty iceType → default 220 x 72', () => {
    expect(pickNodeDefaults('block', '')).toEqual({ width: 220, height: 72 });
  });

  it('container > helper — a container-typed Security.IAM gets 260 x 150 (container branch fires first)', () => {
    // Source code's ternary order: isVpc → isSubnet → isGroup → isHelper. So
    // a `type='container'` block always wins over the helper branch.
    expect(pickNodeDefaults('container', 'Security.IAM')).toEqual({ width: 260, height: 150 });
  });
});
