/**
 * NodeDeployOverlay (CNV1) — invoked as a plain function (tree-walker style)
 * so we can assert the returned element shape without a DOM.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { NodeDeployOverlay } from '../node-deploy-overlay';

type Props = React.ComponentProps<typeof NodeDeployOverlay>;
const render = (props: Props): React.ReactElement | null =>
  (NodeDeployOverlay as (p: Props) => React.ReactElement | null)(props);

describe('NodeDeployOverlay', () => {
  it('renders the deploy step with index/total when deploying', () => {
    const el = render({
      deployStatus: 'deploying',
      deployProgress: { step_label: 'Creating bucket', step_index: 2, step_total: 5 },
    });
    expect(el).not.toBeNull();
    expect((el!.props as { 'data-testid': string })['data-testid']).toBe('node-deploy-progress');
    expect((el!.props as { children: string }).children).toBe('Creating bucket (2/5)');
  });

  it('renders just the step label when index/total are absent', () => {
    const el = render({ deployStatus: 'deploying', deployProgress: { step_label: 'Working' } });
    expect((el!.props as { children: string }).children).toBe('Working');
  });

  it('renders the error line (with full text as title) on failure', () => {
    const el = render({ deployStatus: 'error', deployError: 'quota exceeded' });
    expect((el!.props as { 'data-testid': string })['data-testid']).toBe('node-deploy-error');
    expect((el!.props as { title: string }).title).toBe('quota exceeded');
    expect((el!.props as { children: unknown[] }).children).toEqual(['✗ ', 'quota exceeded']);
  });

  it('respects the bottom offset', () => {
    const el = render({ deployStatus: 'error', deployError: 'x', bottom: 30 });
    expect((el!.props as { style: { bottom: number } }).style.bottom).toBe(30);
  });

  it('renders nothing when there is no actionable deploy state', () => {
    expect(render({ deployStatus: 'active' })).toBeNull();
    expect(render({ deployStatus: 'deploying' })).toBeNull(); // no step_label
    expect(render({ deployStatus: 'error' })).toBeNull(); // no error text
    expect(render({ deployStatus: '' })).toBeNull();
  });
});
