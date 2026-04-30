/**
 * Tests for `firebase-hosting/dns-extractor.ts` (rf-fbh-8).
 *
 * Pure-function checks — no GCP, no async, no mocks. The extractor's
 * surface is "give me a Firebase domain resource (in any of the four
 * historical shapes), I give you a flat normalized DNS record list".
 *
 * Behaviour pinned (see `state/blueprints/rf-fbh.md`):
 *
 * - RISK #11: Four distinct API response shapes co-exist —
 *   `requiredDnsUpdates.{desired,discovered,checking,checks}`,
 *   top-level `dnsRecordSets[]` (or nested under `dnsUpdates`),
 *   `provisioning.dnsStatus[]`, and the legacy
 *   `provisioning.expectedIps[]` + `provisioning.dnsTokens[]` pair.
 *   Each shape has its own test below; a final combined-input test
 *   verifies they merge without losing or duplicating records.
 *
 * - RISK #12: Per-record `domainUpdateAction` overrides the set-level
 *   action argument passed to the inner `walkRecords` helper. Both
 *   the uppercase override (`'ADD'`/`'REMOVE'`) and the lowercase-via-
 *   `toUpperCase()`-coercion path (`r.action: 'remove'` rendered to
 *   `'REMOVE'`) are pinned — this is where Firebase's "single set
 *   carries both add-this-CNAME and remove-that-A" semantics lives.
 *
 * Dedup is also pinned: the same record appearing in multiple shapes
 * (e.g. `desired[]` and `dnsRecordSets[]`) collapses to one output
 * entry via the `seen` set keyed on `type|domain|value`.
 */

import { describe, it, expect } from 'vitest';
import {
  extractDnsRecords,
  type FirebaseHostingDnsRecord,
} from '../dns-extractor.js';

describe('firebase-hosting/dns-extractor', () => {
  describe('extractDnsRecords()', () => {
    it('returns an empty array for null / undefined / empty input', () => {
      expect(extractDnsRecords(null)).toEqual([]);
      expect(extractDnsRecords(undefined)).toEqual([]);
      expect(extractDnsRecords({})).toEqual([]);
    });

    it('extracts records from `requiredDnsUpdates.desired[]` (Shape 1, "add" path)', () => {
      const data = {
        requiredDnsUpdates: {
          desired: [
            {
              domainName: 'example.com',
              records: [
                { type: 'A', requiredText: '199.36.158.100' },
                { type: 'A', requiredText: '199.36.158.101' },
              ],
            },
          ],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '199.36.158.100', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '199.36.158.101', required_action: 'add' },
      ]);
    });

    it('extracts records from `requiredDnsUpdates.discovered[]` with action: "remove" (Shape 1)', () => {
      const data = {
        requiredDnsUpdates: {
          discovered: [
            {
              domainName: 'example.com',
              records: [{ type: 'A', requiredText: '1.2.3.4' }],
            },
          ],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '1.2.3.4', required_action: 'remove' },
      ]);
    });

    it('extracts records from `requiredDnsUpdates.checking[]` (Shape 1, treated as add)', () => {
      const data = {
        requiredDnsUpdates: {
          checking: [
            {
              domainName: 'example.com',
              records: [{ type: 'TXT', requiredText: 'verify-token-abc' }],
            },
          ],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'TXT', domain: 'example.com', value: 'verify-token-abc', required_action: 'add' },
      ]);
    });

    it('extracts records from `requiredDnsUpdates.checks[]` (Shape 1, older variant)', () => {
      const data = {
        requiredDnsUpdates: {
          checks: [
            {
              domainName: 'example.com',
              records: [{ type: 'CNAME', requiredText: 'example.web.app' }],
            },
          ],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'CNAME', domain: 'example.com', value: 'example.web.app', required_action: 'add' },
      ]);
    });

    it('extracts records from top-level `dnsRecordSets[]` (Shape 2)', () => {
      const data = {
        dnsRecordSets: [
          {
            domainName: 'example.com',
            records: [
              { type: 'A', rdata: '199.36.158.100' },
              { type: 'AAAA', rdata: '2001:db8::1' },
            ],
          },
        ],
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '199.36.158.100', required_action: 'add' },
        { type: 'AAAA', domain: 'example.com', value: '2001:db8::1', required_action: 'add' },
      ]);
    });

    it('extracts records from nested `dnsUpdates.dnsRecordSets[]` (Shape 2 fallback)', () => {
      const data = {
        dnsUpdates: {
          dnsRecordSets: [
            {
              domainName: 'example.com',
              records: [{ type: 'A', value: '199.36.158.100' }],
            },
          ],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '199.36.158.100', required_action: 'add' },
      ]);
    });

    it('extracts expectedIps and discoveredIps from `provisioning.dnsStatus[]` (Shape 3, legacy)', () => {
      const data = {
        domain: 'example.com',
        provisioning: {
          dnsStatus: [
            {
              expectedIps: ['199.36.158.100', '199.36.158.101'],
              discoveredIps: ['1.2.3.4'],
            },
          ],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '199.36.158.100', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '199.36.158.101', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '1.2.3.4', required_action: 'verify' },
      ]);
    });

    it('synthesizes A records from `provisioning.expectedIps` and TXT from `dnsTokens` (Shape 4, legacy)', () => {
      const data = {
        domain: 'example.com',
        provisioning: {
          expectedIps: ['199.36.158.100', '199.36.158.101'],
          dnsTokens: ['hosting-site-verification=abc123'],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '199.36.158.100', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '199.36.158.101', required_action: 'add' },
        {
          type: 'TXT',
          domain: 'example.com',
          value: 'hosting-site-verification=abc123',
          required_action: 'add',
        },
      ]);
    });

    // RISK #12 pin: per-record `domainUpdateAction` overrides set-level action.
    it('per-record `domainUpdateAction: "REMOVE"` overrides set-level "ADD" (RISK #12)', () => {
      const data = {
        requiredDnsUpdates: {
          // Set is in `desired[]` so the set-level action is "add",
          // but the individual record carries `domainUpdateAction: 'REMOVE'`
          // and MUST end up tagged 'remove' in the output.
          desired: [
            {
              domainName: 'example.com',
              records: [
                { type: 'A', requiredText: '1.2.3.4', domainUpdateAction: 'REMOVE' },
                { type: 'CNAME', requiredText: 'example.web.app', domainUpdateAction: 'ADD' },
              ],
            },
          ],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '1.2.3.4', required_action: 'remove' },
        { type: 'CNAME', domain: 'example.com', value: 'example.web.app', required_action: 'add' },
      ]);
    });

    // RISK #12 pin: lowercase per-record `action` is coerced via toUpperCase().
    it('per-record `action: "remove"` (lowercase) is coerced to REMOVE (RISK #12)', () => {
      const data = {
        requiredDnsUpdates: {
          checks: [
            {
              domainName: 'example.com',
              records: [
                // lowercase `action` field — must hit the `.toUpperCase()`
                // path and resolve to 'remove'.
                { type: 'A', requiredText: '1.2.3.4', action: 'remove' },
                // `add` (lowercase) → uppercase → 'add'.
                { type: 'CNAME', requiredText: 'example.web.app', action: 'add' },
              ],
            },
          ],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '1.2.3.4', required_action: 'remove' },
        { type: 'CNAME', domain: 'example.com', value: 'example.web.app', required_action: 'add' },
      ]);
    });

    it('dedupes a record that appears in multiple shapes (same type|domain|value collapses)', () => {
      const data = {
        // Shape 1 (desired) and Shape 2 (dnsRecordSets) both carry the
        // same A record. The output must contain it exactly once.
        requiredDnsUpdates: {
          desired: [
            {
              domainName: 'example.com',
              records: [{ type: 'A', requiredText: '199.36.158.100' }],
            },
          ],
        },
        dnsRecordSets: [
          {
            domainName: 'example.com',
            records: [{ type: 'A', requiredText: '199.36.158.100' }],
          },
        ],
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '199.36.158.100', required_action: 'add' },
      ]);
    });

    it('merges all four shapes simultaneously (RISK #11 — no early return between shapes)', () => {
      const data = {
        domain: 'example.com',
        // Shape 1
        requiredDnsUpdates: {
          desired: [
            {
              domainName: 'example.com',
              records: [{ type: 'CNAME', requiredText: 'example.web.app' }],
            },
          ],
          discovered: [
            {
              domainName: 'example.com',
              records: [{ type: 'A', requiredText: '5.6.7.8' }],
            },
          ],
        },
        // Shape 2
        dnsRecordSets: [
          {
            domainName: 'example.com',
            records: [{ type: 'A', requiredText: '199.36.158.100' }],
          },
        ],
        // Shape 3
        provisioning: {
          dnsStatus: [{ expectedIps: ['199.36.158.101'] }],
          // Shape 4 (same node, sibling fields)
          expectedIps: ['199.36.158.102'],
          dnsTokens: ['hosting-site-verification=xyz'],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'CNAME', domain: 'example.com', value: 'example.web.app', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '5.6.7.8', required_action: 'remove' },
        { type: 'A', domain: 'example.com', value: '199.36.158.100', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '199.36.158.101', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '199.36.158.102', required_action: 'add' },
        {
          type: 'TXT',
          domain: 'example.com',
          value: 'hosting-site-verification=xyz',
          required_action: 'add',
        },
      ]);
    });

    // Coverage shoring — these are smaller invariants the SUT touches in
    // every call; pinning them keeps a future "I'll just simplify this"
    // refactor honest.

    it('falls back to `domainData.name` last segment when records have no `domainName`', () => {
      // `name` shape from the GET response: 'projects/p/sites/s/customDomains/example.com'
      const data = {
        name: 'projects/p/sites/s/customDomains/example.com',
        dnsRecordSets: [
          {
            // no domainName on the set — fallbackDomain (= last name segment)
            // must be used.
            records: [{ type: 'A', rdata: '199.36.158.100' }],
          },
        ],
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '199.36.158.100', required_action: 'add' },
      ]);
    });

    it('reads value from `r.requiredText`, `r.required`, `r.value`, `r.rdata`, or `r.target` in that order', () => {
      // Each record below populates ONE of the five value fields the
      // extractor checks (`requiredText ?? required ?? value ?? rdata ??
      // target`). The order matters: when more than one is set, the
      // earlier wins. Test each field individually so we cover them all.
      const data = {
        domain: 'example.com',
        dnsRecordSets: [
          {
            domainName: 'example.com',
            records: [
              { type: 'A', requiredText: '1.1.1.1' },
              { type: 'A', required: '2.2.2.2' },
              { type: 'A', value: '3.3.3.3' },
              { type: 'A', rdata: '4.4.4.4' },
              { type: 'A', target: '5.5.5.5' },
            ],
          },
        ],
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '1.1.1.1', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '2.2.2.2', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '3.3.3.3', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '4.4.4.4', required_action: 'add' },
        { type: 'A', domain: 'example.com', value: '5.5.5.5', required_action: 'add' },
      ]);
    });

    it('skips records missing `type` or with no value field at all', () => {
      const data = {
        dnsRecordSets: [
          {
            domainName: 'example.com',
            records: [
              { type: 'A' /* no value field */ },
              { /* no type */ requiredText: '1.2.3.4' },
              { type: 'A', requiredText: null },
              { type: 'A', requiredText: undefined },
              { type: 'A', requiredText: '199.36.158.100' }, // the only valid one
            ],
          },
        ],
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '199.36.158.100', required_action: 'add' },
      ]);
    });

    it('walks the `checkError.records` fallback when `recordSet.records` is missing', () => {
      // `walkRecords` falls through to `recordSet?.checkError?.records` —
      // this is the older "check-failed" payload shape from
      // `requiredDnsUpdates.checks[]` where the records live nested
      // under `checkError`.
      const data = {
        requiredDnsUpdates: {
          checks: [
            {
              domainName: 'example.com',
              checkError: {
                records: [{ type: 'A', requiredText: '1.2.3.4' }],
              },
            },
          ],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '1.2.3.4', required_action: 'add' },
      ]);
    });

    it('falls back to `domainName` then `domain` for fallbackDomain when `name` is absent', () => {
      // domainName takes precedence over domain; both come into play
      // when the `name` field isn't a string (this is what the GET
      // response from the legacy domains endpoint returns).
      const data1 = {
        domainName: 'example.com',
        provisioning: { expectedIps: ['1.2.3.4'] },
      };
      expect(extractDnsRecords(data1)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '1.2.3.4', required_action: 'add' },
      ]);

      const data2 = {
        domain: 'example.com',
        provisioning: { expectedIps: ['1.2.3.4'] },
      };
      expect(extractDnsRecords(data2)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '1.2.3.4', required_action: 'add' },
      ]);

      // No domain hint at all: empty string falls through.
      const data3 = {
        provisioning: { expectedIps: ['1.2.3.4'] },
      };
      expect(extractDnsRecords(data3)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: '', value: '1.2.3.4', required_action: 'add' },
      ]);
    });

    it('coerces non-string `value` to String() (e.g. when API returns a number)', () => {
      // requiredText is typed `string` in the new API but the legacy
      // value-shape in older clients sometimes returned numbers.
      // The SUT's `String(value)` coercion catches that.
      const data = {
        domain: 'example.com',
        dnsRecordSets: [
          {
            domainName: 'example.com',
            records: [{ type: 'TXT', requiredText: 12345 }],
          },
        ],
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'TXT', domain: 'example.com', value: '12345', required_action: 'add' },
      ]);
    });

    it('an unknown per-record action string falls through to the set-level action', () => {
      // `domainUpdateAction: 'UNKNOWN'` doesn't match 'ADD' or 'REMOVE',
      // so the SUT must return the set-level action ('remove' here,
      // because the set is in `discovered[]`).
      const data = {
        requiredDnsUpdates: {
          discovered: [
            {
              domainName: 'example.com',
              records: [{ type: 'A', requiredText: '1.2.3.4', domainUpdateAction: 'UNKNOWN' }],
            },
          ],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([
        { type: 'A', domain: 'example.com', value: '1.2.3.4', required_action: 'remove' },
      ]);
    });

    it('a record set with neither `records` nor `checkError.records` falls through to []', () => {
      // Pins the third branch of the
      //   `recordSet?.records || recordSet?.checkError?.records || []`
      // OR-chain: when both are absent the loop body must not run.
      const data = {
        dnsRecordSets: [
          {
            domainName: 'example.com',
            // no `records`, no `checkError`
          },
        ],
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([]);
    });

    it('a `provisioning.dnsStatus` entry with neither expectedIps nor discoveredIps emits nothing', () => {
      // Pins both `if (ds.expectedIps)` and `if (ds.discoveredIps)`
      // false branches in Shape 3. Plain pass-through with zero output.
      const data = {
        domain: 'example.com',
        provisioning: {
          dnsStatus: [{ /* neither field set */ }],
        },
      };
      expect(extractDnsRecords(data)).toEqual<FirebaseHostingDnsRecord[]>([]);
    });
  });
});
