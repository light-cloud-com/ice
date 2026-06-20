/**
 * LiveAnnouncer (AX2) — pure status→announcement mapping + the live-region shape.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: { deploy: { status: 'success' as string, nodesById: {} } },
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  return { ...actual, useMemo: <T,>(fn: () => T) => fn() };
});
vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  shallowEqual: () => false,
}));
vi.mock('../../../i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../../../store/slices/deploy-slice', () => ({ deriveRollup: () => ({ total: 0, failed: 0 }) }));

import { LiveAnnouncer, deployAnnouncement } from '../live-announcer';

const t = (k: string, vars?: Record<string, string | number>) => (vars ? `${k}:${JSON.stringify(vars)}` : k);

describe('deployAnnouncement', () => {
  const empty = { total: 0, failed: 0 };

  it('maps each status to its announcement', () => {
    expect(deployAnnouncement(t, 'authenticating' as never, empty)).toBe('a11y.announce.connecting');
    expect(deployAnnouncement(t, 'planning' as never, empty)).toBe('a11y.announce.planning');
    expect(deployAnnouncement(t, 'planned' as never, empty)).toBe('a11y.announce.planReady');
    expect(deployAnnouncement(t, 'destroying' as never, empty)).toBe('a11y.announce.destroying');
    expect(deployAnnouncement(t, 'success' as never, empty)).toBe('a11y.announce.deploySucceeded');
  });

  it('is silent (empty string) when idle so nothing is announced', () => {
    expect(deployAnnouncement(t, 'idle' as never, empty)).toBe('');
  });

  it('includes the resource total while deploying (or a generic message at 0)', () => {
    expect(deployAnnouncement(t, 'deploying' as never, { total: 8, failed: 0 })).toBe(
      'a11y.announce.deployingCount:{"total":8}',
    );
    expect(deployAnnouncement(t, 'deploying' as never, empty)).toBe('a11y.announce.deploying');
  });

  it('includes the failed count on error', () => {
    expect(deployAnnouncement(t, 'error' as never, { total: 8, failed: 2 })).toBe(
      'a11y.announce.deployFailedCount:{"failed":2}',
    );
    expect(deployAnnouncement(t, 'error' as never, empty)).toBe('a11y.announce.deployFailed');
  });
});

describe('LiveAnnouncer component', () => {
  it('renders a polite, atomic status live region with the current announcement', () => {
    mocks.state.deploy.status = 'success';
    const el = (LiveAnnouncer as () => React.ReactElement)();
    const props = el.props as Record<string, unknown>;
    expect(props.role).toBe('status');
    expect(props['aria-live']).toBe('polite');
    expect(props['aria-atomic']).toBe('true');
    expect(props['data-testid']).toBe('live-announcer');
    expect(props.children).toBe('a11y.announce.deploySucceeded');
  });

  it('renders an empty region when idle (nothing to announce)', () => {
    mocks.state.deploy.status = 'idle';
    const el = (LiveAnnouncer as () => React.ReactElement)();
    expect((el.props as Record<string, unknown>).children).toBe('');
  });
});
