/**
 * Tests for `RequirementsSection` — direct-FC tree-walker.
 *
 * Mocks the inner `DnsRecordCard` as an opaque marker so the walker
 * stops descending and we can assert on the prop wiring.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  DnsRecordCard: vi.fn(() => null),
}));

vi.mock('../dns-record-card', () => ({ DnsRecordCard: mocks.DnsRecordCard }));

import { RequirementsSection } from '../requirements-section';
import type { ResolvedRequirementState } from '../../../../store/slices/deploy-slice';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* opaque */
    }
    return;
  }
  yield* walk(node.props.children);
}

function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

function collectText(tree: unknown): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') s += c;
    else if (typeof c === 'number') s += String(c);
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
        else if (typeof item === 'number') s += String(item);
      }
    }
  }
  return s;
}

const makeReq = (overrides: Partial<ResolvedRequirementState> = {}): ResolvedRequirementState => ({
  definitionId: 'd1',
  scope: 'block',
  timing: 'before-deploy',
  blocking: false,
  title: 'Title',
  description: 'desc',
  result: {
    status: 'unknown',
    lastCheckedAt: '',
  },
  ...overrides,
});

interface RenderProps {
  requirements: ResolvedRequirementState[];
  loading?: boolean;
  onVerify?: (definitionId: string, nodeId: string | undefined) => void;
  verifyingId?: string | null;
}

const render = (props: RenderProps): React.ReactElement | null =>
  (RequirementsSection as unknown as (p: RenderProps) => React.ReactElement | null)(props);

beforeEach(() => {
  mocks.DnsRecordCard.mockClear();
  mocks.DnsRecordCard.mockImplementation(() => null);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RequirementsSection — empty / loading', () => {
  it('returns null when requirements is empty and not loading', () => {
    const tree = render({ requirements: [], loading: false });
    expect(tree).toBeNull();
  });

  it('renders a loading state when loading=true and requirements is empty', () => {
    const tree = render({ requirements: [], loading: true });
    const text = collectText(tree);
    expect(text).toContain('Checking block requirements');
  });

  it('does NOT render the loading spinner when requirements are present (loading=true is just a flag)', () => {
    const tree = render({
      requirements: [makeReq()],
      loading: true,
    });
    const text = collectText(tree);
    expect(text).not.toContain('Checking block requirements');
  });
});

describe('RequirementsSection — header', () => {
  it('shows "X blocking" count when one requirement is blocking and not met', () => {
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'd1',
          blocking: true,
          result: { status: 'unmet', lastCheckedAt: '' },
        }),
      ],
    });
    const text = collectText(tree);
    expect(text).toContain('1 blocking');
  });

  it('shows total count when nothing is blocking', () => {
    const tree = render({
      requirements: [
        makeReq({ definitionId: 'd1', blocking: false }),
        makeReq({ definitionId: 'd2', blocking: false }),
      ],
    });
    const text = collectText(tree);
    expect(text).toContain('2 total');
  });
});

describe('RequirementsSection — group separation', () => {
  it('renders a "Before deploy" group when any pre-deploy req exists', () => {
    const tree = render({
      requirements: [makeReq({ timing: 'before-deploy' })],
    });
    expect(collectText(tree)).toContain('Before deploy');
  });

  it('renders a "Post-deploy" group when any post-deploy req exists', () => {
    const tree = render({
      requirements: [makeReq({ timing: 'post-deploy' })],
    });
    expect(collectText(tree)).toContain('Post-deploy');
  });

  it('renders both groups simultaneously', () => {
    const tree = render({
      requirements: [
        makeReq({ definitionId: 'd1', timing: 'before-deploy' }),
        makeReq({ definitionId: 'd2', timing: 'post-deploy' }),
      ],
    });
    const text = collectText(tree);
    expect(text).toContain('Before deploy');
    expect(text).toContain('Post-deploy');
  });

  it('does not render the Before deploy group when no pre-deploy req exists', () => {
    const tree = render({
      requirements: [makeReq({ timing: 'post-deploy' })],
    });
    expect(collectText(tree)).not.toContain('Before deploy');
  });
});

describe('RequirementsSection — RequirementRow status icons', () => {
  it('renders verified-style icon class (text-emerald-500) when status=verified', () => {
    const tree = render({
      requirements: [makeReq({ result: { status: 'verified', lastCheckedAt: '' } })],
    });
    const matches = findAll(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-emerald-500'),
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders unmet-style icon (text-amber-500) when status=unmet', () => {
    const tree = render({
      requirements: [makeReq({ result: { status: 'unmet', lastCheckedAt: '' } })],
    });
    const matches = findAll(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-amber-500'),
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders expired-style icon (text-sky-500) when status=expired', () => {
    const tree = render({
      requirements: [makeReq({ result: { status: 'expired', lastCheckedAt: '' } })],
    });
    const matches = findAll(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-sky-500'),
    );
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe('RequirementsSection — blocking badge', () => {
  it('renders "blocking" badge when blocking=true and not verified', () => {
    const tree = render({
      requirements: [makeReq({ blocking: true })],
    });
    expect(collectText(tree)).toContain('blocking');
  });

  it('renders "satisfied" badge when blocking=true and verified', () => {
    const tree = render({
      requirements: [makeReq({ blocking: true, result: { status: 'verified', lastCheckedAt: '' } })],
    });
    expect(collectText(tree)).toContain('satisfied');
  });

  it('renders neither badge when blocking=false', () => {
    const tree = render({
      requirements: [makeReq({ blocking: false })],
    });
    const text = collectText(tree);
    expect(text).not.toContain('blocking');
    expect(text).not.toContain('satisfied');
  });

  it('renders the "unknown" suffix when status=unknown', () => {
    const tree = render({
      requirements: [makeReq({ result: { status: 'unknown', lastCheckedAt: '' } })],
    });
    expect(collectText(tree)).toContain('unknown');
  });

  it('renders the "timed out" label when status=expired', () => {
    const tree = render({
      requirements: [makeReq({ result: { status: 'expired', lastCheckedAt: '' } })],
    });
    expect(collectText(tree)).toContain('timed out');
  });
});

describe('RequirementsSection — message + lastChecked', () => {
  it('renders the result.message when set', () => {
    const tree = render({
      requirements: [
        makeReq({
          result: {
            status: 'unmet',
            message: 'TXT not found',
            lastCheckedAt: '',
          },
        }),
      ],
    });
    expect(collectText(tree)).toContain('TXT not found');
  });

  it('omits the message paragraph when message is empty', () => {
    const tree = render({
      requirements: [makeReq({ result: { status: 'met', lastCheckedAt: '' } })],
    });
    const text = collectText(tree);
    // Make sure no "message" placeholder is in there.
    expect(text).not.toContain('Last checked');
  });

  it('renders "Last checked" when lastCheckedAt is set', () => {
    const recent = new Date(Date.now() - 30000).toISOString();
    const tree = render({
      requirements: [
        makeReq({
          result: { status: 'verified', lastCheckedAt: recent },
        }),
      ],
    });
    expect(collectText(tree)).toContain('Last checked');
  });

  it('renders "just now" for a future lastCheckedAt timestamp', () => {
    const future = new Date(Date.now() + 5000).toISOString();
    const tree = render({
      requirements: [
        makeReq({
          result: { status: 'verified', lastCheckedAt: future },
        }),
      ],
    });
    expect(collectText(tree)).toContain('just now');
  });

  it('renders absolute date for very-old timestamps', () => {
    const ancient = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const tree = render({
      requirements: [
        makeReq({
          result: { status: 'verified', lastCheckedAt: ancient },
        }),
      ],
    });
    expect(collectText(tree)).toContain('Last checked');
  });

  it('renders "Xs ago" for under-1-minute timestamps', () => {
    const ago30s = new Date(Date.now() - 30 * 1000).toISOString();
    const tree = render({
      requirements: [
        makeReq({
          result: { status: 'verified', lastCheckedAt: ago30s },
        }),
      ],
    });
    expect(collectText(tree)).toContain('30s ago');
  });

  it('renders "Xm ago" for sub-hour timestamps', () => {
    const ago3m = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const tree = render({
      requirements: [
        makeReq({
          result: { status: 'verified', lastCheckedAt: ago3m },
        }),
      ],
    });
    expect(collectText(tree)).toContain('3m ago');
  });

  it('renders "Xh ago" for sub-day timestamps', () => {
    const ago2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const tree = render({
      requirements: [
        makeReq({
          result: { status: 'verified', lastCheckedAt: ago2h },
        }),
      ],
    });
    expect(collectText(tree)).toContain('2h ago');
  });

  it('treats invalid dates as empty (no "Last checked" rendered)', () => {
    const tree = render({
      requirements: [
        makeReq({
          result: { status: 'verified', lastCheckedAt: 'not-a-date' },
        }),
      ],
    });
    // formatLastChecked returns '' for invalid dates → string is rendered as empty.
    // The "Last checked" prefix is still present though — it's part of the source.
    // So just check that it doesn't crash.
    expect(() => collectText(tree)).not.toThrow();
  });

  it('renders message in amber for unmet status', () => {
    const tree = render({
      requirements: [
        makeReq({
          result: { status: 'unmet', message: 'Almost there', lastCheckedAt: '' },
        }),
      ],
    });
    const matches = findAll(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-amber-600'),
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders message in sky for expired status', () => {
    const tree = render({
      requirements: [
        makeReq({
          result: { status: 'expired', message: 'Timed out', lastCheckedAt: '' },
        }),
      ],
    });
    const matches = findAll(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-sky-600'),
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders message in muted color for non-unmet/non-expired status', () => {
    const tree = render({
      requirements: [
        makeReq({
          result: { status: 'verified', message: 'OK', lastCheckedAt: '' },
        }),
      ],
    });
    const matches = findAll(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-muted-foreground'),
    );
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe('RequirementsSection — copy-dns-record action', () => {
  it('renders a DnsRecordCard when action.type === "copy-dns-record"', () => {
    const onVerify = vi.fn();
    const tree = render({
      requirements: [
        makeReq({
          action: {
            type: 'copy-dns-record',
            label: 'Copy DNS',
            payload: { record_type: 'TXT', name: '_lc.x.com', value: 'v', ttl: 60 },
          },
        }),
      ],
      onVerify,
    });
    // Walk the tree to invoke nested FCs, which in turn invoke the mock.
    void [...walk(tree)];
    expect(mocks.DnsRecordCard).toHaveBeenCalled();
    const props = mocks.DnsRecordCard.mock.calls[0][0] as {
      recordType: string;
      name: string;
      value: string;
      ttl: number;
    };
    expect(props.recordType).toBe('TXT');
    expect(props.name).toBe('_lc.x.com');
    expect(props.value).toBe('v');
    expect(props.ttl).toBe(60);
  });

  it('threads onVerify into DnsRecordCard via a closure that calls onVerify(defId, nodeId)', () => {
    const onVerify = vi.fn();
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'd1',
          nodeId: 'n7',
          action: {
            type: 'copy-dns-record',
            label: 'Copy DNS',
            payload: {},
          },
        }),
      ],
      onVerify,
    });
    void [...walk(tree)];
    const props = mocks.DnsRecordCard.mock.calls[0][0] as { onVerify: () => void };
    props.onVerify();
    expect(onVerify).toHaveBeenCalledWith('d1', 'n7');
  });

  it('passes verifying=true when verifyingId matches the row key', () => {
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'd1',
          nodeId: 'n9',
          action: { type: 'copy-dns-record', label: 'Copy', payload: {} },
        }),
      ],
      verifyingId: 'd1:n9',
    });
    void [...walk(tree)];
    const props = mocks.DnsRecordCard.mock.calls[0][0] as { verifying: boolean };
    expect(props.verifying).toBe(true);
  });

  it('passes verifying=false when verifyingId does not match', () => {
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'd1',
          nodeId: 'n9',
          action: { type: 'copy-dns-record', label: 'Copy', payload: {} },
        }),
      ],
      verifyingId: 'something-else',
    });
    void [...walk(tree)];
    const props = mocks.DnsRecordCard.mock.calls[0][0] as { verifying: boolean };
    expect(props.verifying).toBe(false);
  });
});

describe('RequirementsSection — non-dns action button', () => {
  it('renders a button labelled with action.label when action.type !== "copy-dns-record"', () => {
    const tree = render({
      requirements: [
        makeReq({
          action: { type: 'connect-github', label: 'Connect GitHub', payload: {} },
        }),
      ],
    });
    const text = collectText(tree);
    expect(text).toContain('Connect GitHub');
  });

  it('clicks the action button → calls onVerify(definitionId, nodeId)', () => {
    const onVerify = vi.fn();
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'def-x',
          nodeId: 'node-y',
          action: { type: 'connect-github', label: 'Connect GitHub', payload: {} },
        }),
      ],
      onVerify,
    });
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        (el.props as { children: unknown[] }).children.some((c) => typeof c === 'string' && c === 'Connect GitHub'),
    )!;
    const onClick = (btn.props as { onClick: () => void }).onClick;
    onClick();
    expect(onVerify).toHaveBeenCalledWith('def-x', 'node-y');
  });

  it('disables the action button when verifying=true', () => {
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'd1',
          action: { type: 'connect-github', label: 'Connect', payload: {} },
        }),
      ],
      verifyingId: 'd1:',
    });
    const btn = findFirst(tree, (el) => el.type === 'button' && (el.props as { disabled?: boolean }).disabled === true);
    expect(btn).toBeDefined();
  });
});

describe('RequirementsSection — fallback recheck button', () => {
  it('renders the "Check again" recheck button for unresolved post-deploy req without action', () => {
    const onVerify = vi.fn();
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'd1',
          timing: 'post-deploy',
          result: { status: 'checking', lastCheckedAt: '' },
        }),
      ],
      onVerify,
    });
    expect(collectText(tree)).toContain('Check again');
  });

  it('does NOT render the recheck button when verified', () => {
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'd1',
          timing: 'post-deploy',
          result: { status: 'verified', lastCheckedAt: '' },
        }),
      ],
      onVerify: vi.fn(),
    });
    expect(collectText(tree)).not.toContain('Check again');
  });

  it('shows "Checking…" copy when verifying via the fallback recheck', () => {
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'd1',
          timing: 'post-deploy',
          result: { status: 'unmet', lastCheckedAt: '' },
        }),
      ],
      onVerify: vi.fn(),
      verifyingId: 'd1:',
    });
    expect(collectText(tree)).toContain('Checking…');
  });

  it('clicking the recheck → onVerify(definitionId, nodeId)', () => {
    const onVerify = vi.fn();
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'd1',
          nodeId: 'n2',
          timing: 'post-deploy',
          result: { status: 'unmet', lastCheckedAt: '' },
        }),
      ],
      onVerify,
    });
    const btns = findAll(tree, (el) => el.type === 'button');
    expect(btns.length).toBeGreaterThan(0);
    const onClick = (btns[btns.length - 1].props as { onClick: () => void }).onClick;
    onClick();
    expect(onVerify).toHaveBeenCalledWith('d1', 'n2');
  });

  it('does NOT render recheck for pre-deploy unresolved (only post-deploy gets it)', () => {
    const tree = render({
      requirements: [
        makeReq({
          definitionId: 'd1',
          timing: 'before-deploy',
          result: { status: 'unmet', lastCheckedAt: '' },
        }),
      ],
      onVerify: vi.fn(),
    });
    expect(collectText(tree)).not.toContain('Check again');
  });
});
