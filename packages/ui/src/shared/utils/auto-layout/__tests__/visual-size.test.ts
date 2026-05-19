/**
 * Visual-size resolution. Pure functions — fixture inputs cover every
 * iceType branch in `resolveVisualSize` and every branch in
 * `intrinsicContainerMin`.
 */

import { describe, it, expect } from 'vitest';
import { intrinsicContainerMin, resolveVisualSize } from '../visual-size';
import type { LayoutNode } from '../types';

const PN_MIN_W = 560;
const PN_MIN_H = 320;
const MIN_W = 240;
const MIN_H = 150;
const CARD_W = 240;
const CARD_H = 160;

function mk(iceType: string, opts: Partial<LayoutNode> = {}): LayoutNode {
  return {
    id: 'n',
    type: 'resource',
    iceType,
    label: '',
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    data: {},
    ...opts,
  };
}

describe('intrinsicContainerMin', () => {
  it('Private Network returns the PN floor', () => {
    expect(intrinsicContainerMin('Network.PrivateNetwork')).toEqual({ width: PN_MIN_W, height: PN_MIN_H });
  });

  it('every other iceType returns the generic MIN_CONTAINER floor', () => {
    expect(intrinsicContainerMin('Group.Custom')).toEqual({ width: MIN_W, height: MIN_H });
    expect(intrinsicContainerMin('Group.Frontend')).toEqual({ width: MIN_W, height: MIN_H });
    expect(intrinsicContainerMin('Compute.Container')).toEqual({ width: MIN_W, height: MIN_H });
    expect(intrinsicContainerMin('')).toEqual({ width: MIN_W, height: MIN_H });
  });
});

describe('resolveVisualSize', () => {
  describe('Private Network', () => {
    it('floors width and height to the PN minimum', () => {
      const n = mk('Network.PrivateNetwork', { width: 240, height: 160 });
      expect(resolveVisualSize(n)).toEqual({ width: PN_MIN_W, height: PN_MIN_H });
    });

    it('preserves a stored size larger than the minimum', () => {
      const n = mk('Network.PrivateNetwork', { width: 800, height: 500 });
      expect(resolveVisualSize(n)).toEqual({ width: 800, height: 500 });
    });
  });

  describe('Custom Domain', () => {
    it('zero routes: width = CARD + 40, height = header+domain+pad+addbtn+pad', () => {
      const n = mk('Network.CustomDomain');
      const r = resolveVisualSize(n);
      // 48 + 38 + 10 + 0 + 10 + 32 + 10 = 148
      expect(r.width).toBe(CARD_W + 40);
      expect(r.height).toBe(48 + 38 + 10 + 0 + 10 + 32 + 10);
    });

    it('two routes: height grows by 2 * (rowH + rowGap)', () => {
      const n = mk('Network.CustomDomain', { data: { routes: [{ id: 'r1' }, { id: 'r2' }] } });
      const r = resolveVisualSize(n);
      expect(r.height).toBe(48 + 38 + 10 + 2 * (36 + 4) + 10 + 32 + 10);
    });

    it('routes missing in data is treated as []', () => {
      const n = mk('Network.CustomDomain', { data: {} });
      expect(resolveVisualSize(n).height).toBe(48 + 38 + 10 + 0 + 10 + 32 + 10);
    });
  });

  describe('Message Queue / Queue', () => {
    it('Messaging.MessageQueue with no queues uses 1 row floor', () => {
      const n = mk('Messaging.MessageQueue');
      const r = resolveVisualSize(n);
      // 48 + 12 + 1*(26+4) + 12 = 102 ; floored to CARD_H=160
      expect(r.height).toBe(Math.max(48 + 12 + 1 * (26 + 4) + 12, CARD_H));
    });

    it('Messaging.Queue (alias) with 4 queues', () => {
      const n = mk('Messaging.Queue', { data: { queues: [1, 2, 3, 4] } });
      const r = resolveVisualSize(n);
      const expected = 48 + 12 + 4 * (26 + 4) + 12;
      expect(r.height).toBe(Math.max(expected, CARD_H));
    });
  });

  describe('Email Service', () => {
    it('Messaging.EmailService uses fixed two-field height', () => {
      const n = mk('Messaging.EmailService');
      const r = resolveVisualSize(n);
      // 48 + 12 + 30*2 + 6 + 12 = 138 ; floored to 160
      expect(r.height).toBe(Math.max(48 + 12 + 60 + 6 + 12, CARD_H));
    });
  });

  describe('Secret Store', () => {
    it('Security.Secret with one secret', () => {
      const n = mk('Security.Secret', { data: { secrets: [{}] } });
      // 48 + 12 + 1*20 + 12 = 92 ; floored to 160
      expect(resolveVisualSize(n).height).toBe(Math.max(48 + 12 + 20 + 12, CARD_H));
    });

    it('Security.SecretStore with no secrets uses 1-row floor', () => {
      const n = mk('Security.SecretStore');
      // 48 + 12 + 1*20 + 12 = 92 ; floored to 160
      expect(resolveVisualSize(n).height).toBe(Math.max(92, CARD_H));
    });

    it('Security.SecretStore with five secrets', () => {
      const n = mk('Security.SecretStore', { data: { secrets: [{}, {}, {}, {}, {}] } });
      const expected = 48 + 12 + 5 * 20 + 12; // 172
      expect(resolveVisualSize(n).height).toBe(expected);
    });
  });

  describe('Env Config', () => {
    it('Config.Env with three vars', () => {
      const n = mk('Config.Env', { data: { variables: [{}, {}, {}] } });
      const expected = 48 + 12 + 3 * 20 + 12; // 132
      expect(resolveVisualSize(n).height).toBe(Math.max(expected, CARD_H));
    });

    it('Config.EnvConfig with no variables uses 1-row floor', () => {
      const n = mk('Config.EnvConfig');
      // 48 + 12 + 1*20 + 12 = 92 ; floored to 160
      expect(resolveVisualSize(n).height).toBe(Math.max(92, CARD_H));
    });

    it('Config.EnvConfig with eight variables exceeds CARD_HEIGHT floor', () => {
      const n = mk('Config.EnvConfig', { data: { variables: Array(8).fill({}) } });
      const expected = 48 + 12 + 8 * 20 + 12; // 232
      expect(resolveVisualSize(n).height).toBe(expected);
    });
  });

  describe('generic blocks', () => {
    it('a plain compute block falls through with stored size', () => {
      const n = mk('Compute.Container', { width: 240, height: 160 });
      expect(resolveVisualSize(n)).toEqual({ width: 240, height: 160 });
    });

    it('storedW=0 falls back to CARD_WIDTH', () => {
      const n = mk('Compute.Container', { width: 0, height: 200 });
      expect(resolveVisualSize(n).width).toBe(CARD_W);
      expect(resolveVisualSize(n).height).toBe(200);
    });

    it('storedH=0 falls back to CARD_HEIGHT', () => {
      const n = mk('Compute.Container', { width: 240, height: 0 });
      expect(resolveVisualSize(n).height).toBe(CARD_H);
    });

    it('height below CARD_HEIGHT is floored', () => {
      const n = mk('Compute.Container', { width: 240, height: 50 });
      expect(resolveVisualSize(n).height).toBe(CARD_H);
    });
  });

  describe('iceType resolution', () => {
    it('falls back to data.iceType when node.iceType is empty', () => {
      const n: LayoutNode = {
        id: 'n',
        type: 'resource',
        iceType: '',
        label: '',
        width: 240,
        height: 160,
        x: 0,
        y: 0,
        data: { iceType: 'Network.PrivateNetwork' },
      };
      expect(resolveVisualSize(n)).toEqual({ width: PN_MIN_W, height: PN_MIN_H });
    });

    it('returns CARD defaults when neither node nor data carry an iceType', () => {
      const n: LayoutNode = {
        id: 'n',
        type: 'resource',
        iceType: '',
        label: '',
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        data: {},
      };
      expect(resolveVisualSize(n)).toEqual({ width: CARD_W, height: CARD_H });
    });

    it('null data is tolerated (treated as empty object)', () => {
      const n = {
        id: 'n',
        type: 'resource',
        iceType: 'Compute.Container',
        label: '',
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        data: null as unknown as Record<string, unknown>,
      };
      expect(resolveVisualSize(n).height).toBe(CARD_H);
    });
  });
});
