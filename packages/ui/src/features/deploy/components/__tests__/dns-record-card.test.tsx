/**
 * Tests for `DnsRecordCard` — pure presentational FC + tiny clipboard logic.
 *
 * Strategy: direct-FC tree-walker. `useState` is mocked with a mutable
 * ref so tests can drive the `copied` state. Clipboard is stubbed via
 * `navigator.clipboard.writeText`. `setTimeout` is faked.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  copiedRef: { current: null as string | null },
  setCopiedSpy: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(initial: T | (() => T)) => {
    void initial;
    return [mocks.copiedRef.current as unknown as T, mocks.setCopiedSpy as unknown];
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: {
      ...actualDefault,
      useState: useStateStub,
    },
    useState: useStateStub,
  };
});

import { DnsRecordCard, type DnsRecordCardProps } from '../dns-record-card';

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

const render = (
  props: Partial<DnsRecordCardProps> & { recordType: string; name: string; value: string },
): React.ReactElement =>
  (DnsRecordCard as unknown as (p: DnsRecordCardProps) => React.ReactElement)(props as DnsRecordCardProps);

beforeEach(() => {
  mocks.copiedRef.current = null;
  mocks.setCopiedSpy.mockReset();
  mocks.writeText.mockReset();
  mocks.writeText.mockResolvedValue(undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
  vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DnsRecordCard — basic render', () => {
  it('renders the record fields (Type, Name, Value)', () => {
    const tree = render({ recordType: 'TXT', name: '_lc.example.com', value: 'ice-verify=abc' });
    const text = collectText(tree);
    expect(text).toContain('TXT');
    expect(text).toContain('_lc.example.com');
    expect(text).toContain('ice-verify=abc');
  });

  it('renders the default TTL of 300', () => {
    const tree = render({ recordType: 'A', name: 'example.com', value: '1.2.3.4' });
    const text = collectText(tree);
    expect(text).toContain('300');
  });

  it('renders a custom TTL when provided', () => {
    const tree = render({ recordType: 'A', name: 'example.com', value: '1.2.3.4', ttl: 600 });
    const text = collectText(tree);
    expect(text).toContain('600');
  });

  it('renders no status chip when status is undefined', () => {
    const tree = render({ recordType: 'A', name: 'x', value: 'y' });
    const text = collectText(tree);
    expect(text).not.toContain('Verified');
    expect(text).not.toContain('Configured');
  });
});

describe('DnsRecordCard — status chips', () => {
  it.each([
    ['unknown', 'Not checked'],
    ['checking', 'Checking…'],
    ['unmet', 'Waiting for record'],
    ['met', 'Configured'],
    ['verified', 'Verified'],
    ['expired', 'Timed out'],
  ] as const)('renders chip label "%s" for status="%s"', (status, label) => {
    const tree = render({ recordType: 'A', name: 'x', value: 'y', status });
    const text = collectText(tree);
    expect(text).toContain(label);
  });

  it('renders the lastChecked relative time when status + lastCheckedAt set', () => {
    const ago30s = new Date(Date.now() - 30 * 1000).toISOString();
    const tree = render({
      recordType: 'A',
      name: 'x',
      value: 'y',
      status: 'verified',
      lastCheckedAt: ago30s,
    });
    const text = collectText(tree);
    expect(text).toContain('30s ago');
  });

  it('omits lastChecked when not provided', () => {
    const tree = render({ recordType: 'A', name: 'x', value: 'y', status: 'verified' });
    const text = collectText(tree);
    expect(text).not.toContain('checked');
  });
});

describe('DnsRecordCard — copy interaction', () => {
  it('clicks the value button → calls navigator.clipboard.writeText with the value', () => {
    const tree = render({ recordType: 'A', name: 'host', value: 'ice-verify=abc' });
    // Look for a button with title="Click to copy".
    const valueBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'Click to copy',
    );
    expect(valueBtn).toBeDefined();
    const onClick = (valueBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.writeText).toHaveBeenCalledWith('ice-verify=abc');
  });

  it('clicks the "Copy record" button → calls writeText with the formatted line', () => {
    const tree = render({ recordType: 'TXT', name: 'h', value: 'v', ttl: 60 });
    // The "Copy record" button is the first button (after the value button).
    const buttons = findAll(tree, (el) => el.type === 'button');
    // Order: [valueBtn, copy-record, optionally verify]
    const copyAll = buttons.find((b) => {
      const className = (b.props as { className?: string }).className;
      return (
        typeof className === 'string' &&
        className.includes('Copy record') === false &&
        // discriminate via children including 'Copy record' text
        true
      );
    });
    void copyAll; // unused, fall through
    // Easier: just find by predicate that label text is 'Copy record'.
    const btn = buttons.find((b) => {
      // children contains an icon and a string 'Copy record' (or 'Copied!')
      const ch = (b.props as { children?: unknown }).children;
      if (Array.isArray(ch)) {
        return ch.some((c) => typeof c === 'string' && (c === 'Copy record' || c === 'Copied!'));
      }
      return false;
    });
    expect(btn).toBeDefined();
    const onClick = (btn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.writeText).toHaveBeenCalledWith('TXT h v 60');
  });

  it('shows "copied" indicator for value when copied state === "value"', () => {
    mocks.copiedRef.current = 'value';
    const tree = render({ recordType: 'A', name: 'h', value: 'val' });
    const text = collectText(tree);
    expect(text).toContain('copied');
  });

  it('shows "Copied!" label on the Copy record button when copied state === "all"', () => {
    mocks.copiedRef.current = 'all';
    const tree = render({ recordType: 'A', name: 'h', value: 'v' });
    const text = collectText(tree);
    expect(text).toContain('Copied!');
  });
});

describe('DnsRecordCard — verify button', () => {
  it('does NOT render a Verify button when onVerify is undefined', () => {
    const tree = render({ recordType: 'A', name: 'h', value: 'v' });
    const text = collectText(tree);
    expect(text).not.toContain('Verify now');
  });

  it('renders a Verify button when onVerify is provided', () => {
    const onVerify = vi.fn();
    const tree = render({ recordType: 'A', name: 'h', value: 'v', onVerify });
    const text = collectText(tree);
    expect(text).toContain('Verify now');
  });

  it('clicks the Verify button → calls onVerify', () => {
    const onVerify = vi.fn();
    const tree = render({ recordType: 'A', name: 'h', value: 'v', onVerify });
    const buttons = findAll(tree, (el) => el.type === 'button');
    const verifyBtn = buttons.find((b) => {
      const ch = (b.props as { children?: unknown }).children;
      if (Array.isArray(ch)) {
        return ch.some((c) => typeof c === 'string' && c === 'Verify now');
      }
      return false;
    });
    expect(verifyBtn).toBeDefined();
    const onClick = (verifyBtn!.props as { onClick: () => void }).onClick;
    onClick();
    expect(onVerify).toHaveBeenCalledTimes(1);
  });

  it('Verify button is disabled when verifying=true', () => {
    const onVerify = vi.fn();
    const tree = render({ recordType: 'A', name: 'h', value: 'v', onVerify, verifying: true });
    const buttons = findAll(tree, (el) => el.type === 'button');
    const verifyBtn = buttons.find((b) => (b.props as { disabled?: boolean }).disabled);
    expect(verifyBtn).toBeDefined();
  });
});

describe('DnsRecordCard — clipboard rejection', () => {
  it('silently swallows writeText errors', async () => {
    mocks.writeText.mockRejectedValue(new Error('denied'));
    const tree = render({ recordType: 'A', name: 'h', value: 'v' });
    const valueBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'Click to copy',
    )!;
    const onClick = (valueBtn.props as { onClick: () => Promise<void> }).onClick;
    // Should not throw.
    await expect(onClick()).resolves.toBeUndefined();
  });
});

describe('DnsRecordCard — setCopied timer callback', () => {
  it('the deferred reset calls setCopied with a function that returns null when current === key', async () => {
    const tree = render({ recordType: 'A', name: 'h', value: 'v' });
    const valueBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'Click to copy',
    )!;
    const onClick = (valueBtn.props as { onClick: () => Promise<void> }).onClick;
    await onClick();
    // Two setCopied calls: immediate setCopied(key) + deferred reset.
    expect(mocks.setCopiedSpy).toHaveBeenCalledWith('value');
    // Advance the 1200ms timer.
    vi.advanceTimersByTime(1500);
    // The deferred call passes a function — apply it manually.
    const deferred = mocks.setCopiedSpy.mock.calls.find((c) => typeof c[0] === 'function');
    expect(deferred).toBeDefined();
    const fn = deferred![0] as (c: string | null) => string | null;
    // Returns null when current === key.
    expect(fn('value')).toBeNull();
    // Returns current verbatim when current !== key (race-condition path).
    expect(fn('different-key')).toBe('different-key');
  });
});

describe('DnsRecordCard — timeAgo helper', () => {
  it('renders "minutes" granularity', () => {
    const ago2m = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const tree = render({ recordType: 'A', name: 'x', value: 'y', status: 'verified', lastCheckedAt: ago2m });
    expect(collectText(tree)).toContain('2m ago');
  });

  it('renders "hours" granularity', () => {
    const ago3h = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const tree = render({ recordType: 'A', name: 'x', value: 'y', status: 'verified', lastCheckedAt: ago3h });
    expect(collectText(tree)).toContain('3h ago');
  });

  it('renders "days" granularity', () => {
    const ago2d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const tree = render({ recordType: 'A', name: 'x', value: 'y', status: 'verified', lastCheckedAt: ago2d });
    expect(collectText(tree)).toContain('2d ago');
  });
});
