/**
 * rf-pdpl-3 — `utils/dns-records.ts` invariant tests.
 *
 * The module was lifted verbatim from `deploy-panel.tsx` (L600–701). These
 * tests pin the exact filter / split semantics so any future "tidy up" — e.g.
 * dropping the length-0 guard, removing the `(r.outputs as any)` cast in
 * favor of a type guard, or simplifying the OR-default in splitDnsByAction —
 * fails loudly. Behavior #7 in the rf-pdpl blueprint risk list.
 */

import { describe, it, expect } from 'vitest';
import type { DeployResourceResult } from '../../../../store/slices/deploy-slice';
import { extractDnsResults, splitDnsByAction, type DnsRec } from '../dns-records';

// ─── Test fixtures ──────────────────────────────────────────────────────────

function makeResult(overrides: Partial<DeployResourceResult> = {}): DeployResourceResult {
  return {
    name: 'example.com',
    type: 'CustomDomain',
    action: 'create',
    success: true,
    outputs: {},
    ...overrides,
  };
}

function makeRec(rec: Partial<DnsRec> = {}): DnsRec {
  return {
    type: 'A',
    domain: 'example.com',
    value: '127.0.0.1',
    ...rec,
  };
}

// ─── extractDnsResults ──────────────────────────────────────────────────────

describe('extractDnsResults', () => {
  it('returns an empty array when given no results', () => {
    expect(extractDnsResults([])).toEqual([]);
  });

  it('drops every entry where success is false', () => {
    const results: DeployResourceResult[] = [
      makeResult({
        success: false,
        outputs: { custom_domain_dns_records: [makeRec()] },
      }),
      makeResult({
        success: false,
        outputs: { custom_domain_dns_records: [makeRec(), makeRec()] },
      }),
    ];
    expect(extractDnsResults(results)).toEqual([]);
  });

  it('drops entries where outputs is undefined entirely', () => {
    const results: DeployResourceResult[] = [makeResult({ outputs: undefined })];
    expect(extractDnsResults(results)).toEqual([]);
  });

  it('drops entries where outputs.custom_domain_dns_records is missing', () => {
    const results: DeployResourceResult[] = [
      makeResult({ outputs: {} }),
      makeResult({ outputs: { other_field: 'irrelevant' } }),
    ];
    expect(extractDnsResults(results)).toEqual([]);
  });

  it('drops entries where outputs.custom_domain_dns_records is not an array', () => {
    // Hypothetical future deployer revision that swaps the shape — must not
    // crash on `.length` and must not be included.
    const results: DeployResourceResult[] = [
      makeResult({ outputs: { custom_domain_dns_records: { error: 'oops' } as unknown as DnsRec[] } }),
      makeResult({ outputs: { custom_domain_dns_records: 'a string' as unknown as DnsRec[] } }),
      makeResult({ outputs: { custom_domain_dns_records: null as unknown as DnsRec[] } }),
    ];
    expect(extractDnsResults(results)).toEqual([]);
  });

  it('drops entries where custom_domain_dns_records is an empty array (length-0 filter)', () => {
    const results: DeployResourceResult[] = [
      makeResult({ outputs: { custom_domain_dns_records: [] } }),
    ];
    expect(extractDnsResults(results)).toEqual([]);
  });

  it('returns only successful entries with non-empty DNS records (mixed input)', () => {
    const keep1 = makeResult({
      name: 'one.example.com',
      success: true,
      outputs: { custom_domain_dns_records: [makeRec({ domain: 'one.example.com' })] },
    });
    const drop1 = makeResult({ name: 'two', success: false, outputs: { custom_domain_dns_records: [makeRec()] } });
    const drop2 = makeResult({ name: 'three', success: true, outputs: {} });
    const drop3 = makeResult({ name: 'four', success: true, outputs: { custom_domain_dns_records: [] } });
    const keep2 = makeResult({
      name: 'five.example.com',
      success: true,
      outputs: { custom_domain_dns_records: [makeRec({ domain: 'five.example.com' }), makeRec()] },
    });

    const out = extractDnsResults([keep1, drop1, drop2, drop3, keep2]);
    expect(out).toEqual([keep1, keep2]);
  });

  it('preserves the order of the input results', () => {
    const a = makeResult({ name: 'a', outputs: { custom_domain_dns_records: [makeRec()] } });
    const b = makeResult({ name: 'b', outputs: { custom_domain_dns_records: [makeRec()] } });
    const c = makeResult({ name: 'c', outputs: { custom_domain_dns_records: [makeRec()] } });
    expect(extractDnsResults([c, a, b]).map((r) => r.name)).toEqual(['c', 'a', 'b']);
  });
});

// ─── splitDnsByAction ───────────────────────────────────────────────────────

describe('splitDnsByAction', () => {
  it('returns two empty arrays for empty input', () => {
    expect(splitDnsByAction([])).toEqual({ addRecords: [], removeRecords: [] });
  });

  it('puts every record with undefined required_action into addRecords (default-via-OR)', () => {
    const records: DnsRec[] = [
      makeRec({ domain: 'one.example.com' }),
      makeRec({ domain: 'two.example.com' }),
      makeRec({ domain: 'three.example.com' }),
    ];
    const out = splitDnsByAction(records);
    expect(out.addRecords).toEqual(records);
    expect(out.removeRecords).toEqual([]);
  });

  it("puts every record with required_action: 'remove' into removeRecords", () => {
    const records: DnsRec[] = [
      makeRec({ domain: 'a.example.com', required_action: 'remove' }),
      makeRec({ domain: 'b.example.com', required_action: 'remove' }),
    ];
    const out = splitDnsByAction(records);
    expect(out.addRecords).toEqual([]);
    expect(out.removeRecords).toEqual(records);
  });

  it("puts records with required_action: 'add' into addRecords (literal, not just default)", () => {
    const records: DnsRec[] = [
      makeRec({ domain: 'literal-add.example.com', required_action: 'add' }),
    ];
    const out = splitDnsByAction(records);
    expect(out.addRecords).toEqual(records);
    expect(out.removeRecords).toEqual([]);
  });

  it("puts records with required_action: 'verify' (any other string) into addRecords (the OR-default quirk)", () => {
    // The default-via-OR means ANY non-'remove' string → addRecords:
    // - 'verify' → addRecords (NOT a separate bucket, NOT dropped)
    // - 'pending' → addRecords
    // - '' (empty string is falsy → OR returns 'add') → addRecords
    const verify = makeRec({ domain: 'v.example.com', required_action: 'verify' });
    const pending = makeRec({ domain: 'p.example.com', required_action: 'pending' });
    const empty = makeRec({ domain: 'e.example.com', required_action: '' });
    const out = splitDnsByAction([verify, pending, empty]);
    expect(out.addRecords).toEqual([verify, pending, empty]);
    expect(out.removeRecords).toEqual([]);
  });

  it('correctly splits a mixed batch (add / remove / undefined / other)', () => {
    const undef = makeRec({ domain: 'undef.example.com' });
    const add = makeRec({ domain: 'add.example.com', required_action: 'add' });
    const remove1 = makeRec({ domain: 'remove1.example.com', required_action: 'remove' });
    const verify = makeRec({ domain: 'verify.example.com', required_action: 'verify' });
    const remove2 = makeRec({ domain: 'remove2.example.com', required_action: 'remove' });

    const out = splitDnsByAction([undef, add, remove1, verify, remove2]);

    // addRecords: undef + literal-add + verify (the three non-'remove')
    expect(out.addRecords).toEqual([undef, add, verify]);
    // removeRecords: only the two 'remove' literals
    expect(out.removeRecords).toEqual([remove1, remove2]);
  });

  it('never puts the same record into both lists', () => {
    // Mutual exclusivity is the load-bearing invariant — confirm by
    // intersecting the two outputs for every shape that could be ambiguous.
    const cases: DnsRec[] = [
      makeRec({ required_action: 'remove' }),
      makeRec({ required_action: 'add' }),
      makeRec({ required_action: 'verify' }),
      makeRec({ required_action: undefined }),
      makeRec({ required_action: '' }),
    ];
    for (const rec of cases) {
      const out = splitDnsByAction([rec]);
      const inAdd = out.addRecords.includes(rec);
      const inRemove = out.removeRecords.includes(rec);
      expect(inAdd && inRemove).toBe(false);
      // Every record must appear in exactly one bucket.
      expect(inAdd || inRemove).toBe(true);
    }
  });

  it('preserves the input order within each bucket', () => {
    const records: DnsRec[] = [
      makeRec({ domain: 'first.example.com', required_action: 'remove' }),
      makeRec({ domain: 'second.example.com' }),
      makeRec({ domain: 'third.example.com', required_action: 'remove' }),
      makeRec({ domain: 'fourth.example.com', required_action: 'add' }),
    ];
    const out = splitDnsByAction(records);
    expect(out.addRecords.map((r) => r.domain)).toEqual(['second.example.com', 'fourth.example.com']);
    expect(out.removeRecords.map((r) => r.domain)).toEqual(['first.example.com', 'third.example.com']);
  });
});
