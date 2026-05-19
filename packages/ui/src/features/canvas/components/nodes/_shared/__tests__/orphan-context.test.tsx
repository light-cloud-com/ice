/**
 * Tests for the OrphanNodes context — small wrapper around React's
 * createContext that drives the "Not connected" indicator in CardShell.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { OrphanNodesProvider, useIsNodeOrphan } from '../orphan-context';

const Probe: React.FC<{ nodeId: string; onResult: (val: boolean) => void }> = ({ nodeId, onResult }) => {
  const orphan = useIsNodeOrphan(nodeId);
  onResult(orphan);
  return null;
};

describe('useIsNodeOrphan', () => {
  it('returns false when no provider is mounted (default empty set)', () => {
    let captured: boolean | undefined;
    renderToString(<Probe nodeId="n1" onResult={(v) => (captured = v)} />);
    expect(captured).toBe(false);
  });

  it('returns true when the provider Set contains the nodeId', () => {
    let captured: boolean | undefined;
    renderToString(
      <OrphanNodesProvider value={new Set(['n1', 'n2'])}>
        <Probe nodeId="n1" onResult={(v) => (captured = v)} />
      </OrphanNodesProvider>,
    );
    expect(captured).toBe(true);
  });

  it('returns false when the provider Set does not contain the nodeId', () => {
    let captured: boolean | undefined;
    renderToString(
      <OrphanNodesProvider value={new Set(['n2', 'n3'])}>
        <Probe nodeId="n1" onResult={(v) => (captured = v)} />
      </OrphanNodesProvider>,
    );
    expect(captured).toBe(false);
  });
});
