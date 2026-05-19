/**
 * Firebase Hosting DNS extractor (rf-fbh-8).
 *
 * Pulls DNS records out of either the customDomains or legacy domains
 * response. Firebase has rotated through several response shapes over
 * the years; we try every known shape and merge whatever we find.
 *
 * Behaviour preserved verbatim from the original orchestrator (see
 * `state/blueprints/rf-fbh.md`):
 *
 * - RISK #11: Four distinct API response shapes co-exist —
 *   `requiredDnsUpdates.{desired,discovered,checking,checks}`,
 *   top-level `dnsRecordSets[]` (or nested under `dnsUpdates`),
 *   `provisioning.dnsStatus[]`, and the legacy
 *   `provisioning.expectedIps[]` + `provisioning.dnsTokens[]` pair.
 *   ALL shapes are merged — no early return — because a single domain
 *   resource can carry data from more than one shape (the API
 *   sometimes overlaps formats during transitions). The dedup `seen`
 *   set keys on `type|domain|value` so duplicate records across shapes
 *   collapse to a single entry.
 *
 * - RISK #12: Per-record `domainUpdateAction` overrides the set-level
 *   action passed to `walkRecords`. Firebase tags individual records
 *   as ADD/REMOVE so a single set can carry both ("add this CNAME,
 *   remove that A"). The override path uppercases via `toUpperCase()`
 *   and matches against `'ADD'` / `'REMOVE'` literals — both
 *   `'add'`/`'remove'` (lowercase from caller) and `'ADD'`/`'REMOVE'`
 *   (per-record override) variants must be handled identically.
 */

/**
 * Shape of the DNS records the user needs to add at their registrar to
 * verify a Firebase Hosting custom domain. Firebase returns these in the
 * `dnsRecords` field of a domain resource (or in `dnsRecordSets` for the
 * newer API). We normalize to a flat list so the deploy panel can render
 * a copy-record UI without knowing the API shape.
 */
export interface FirebaseHostingDnsRecord {
  type: 'A' | 'AAAA' | 'TXT' | 'CNAME';
  domain: string;
  value: string;
  /**
   * `add` — record the user MUST add at their registrar
   * `remove` — record currently at the registrar that CONFLICTS with
   *            the desired state and must be removed (e.g. an existing
   *            A record from the user's old hosting that's blocking
   *            the new CNAME)
   * `verify` — record currently being checked (informational)
   */
  required_action: 'add' | 'remove' | 'verify';
}

/**
 * Pull DNS records out of either the customDomains or legacy domains
 * response. Firebase has rotated through several response shapes over
 * the years; we try every known shape and merge whatever we find.
 *
 * Known shapes:
 *   - `requiredDnsUpdates.discovered[]` and `.checking[]` (newer API)
 *   - `requiredDnsUpdates.checks[]`
 *   - top-level `dnsRecordSets[]`
 *   - legacy `provisioning.dnsStatus[]` (oldest API)
 *   - legacy `provisioning.expectedIps[]` + `provisioning.dnsTokens[]`
 */
export function extractDnsRecords(domainData: any): FirebaseHostingDnsRecord[] {
  if (!domainData) return [];
  const out: FirebaseHostingDnsRecord[] = [];
  const seen = new Set<string>();
  const push = (rec: FirebaseHostingDnsRecord) => {
    const key = `${rec.type}|${rec.domain}|${rec.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(rec);
  };

  const fallbackDomain =
    (typeof domainData.name === 'string' ? domainData.name.split('/').pop() : null) ||
    domainData.domainName ||
    domainData.domain ||
    '';

  // Walk a record set and emit entries with the given action.
  // `recordSet` can be a CheckResult (with `records`) or a RecordSet
  // (with `rdata` directly). We handle both shapes.
  const walkRecords = (recordSet: any, action: 'add' | 'remove'): void => {
    const setDomain = recordSet?.domainName || fallbackDomain;
    const records = recordSet?.records || recordSet?.checkError?.records || [];
    for (const r of records) {
      // domainUpdateAction overrides the default action when present.
      // Firebase tags individual records as ADD/REMOVE so a single set
      // can carry both ("add this CNAME, remove that A").
      const recordAction = (() => {
        const ua = (r.domainUpdateAction || r.action || '').toUpperCase();
        if (ua === 'ADD') return 'add';
        if (ua === 'REMOVE') return 'remove';
        return action;
      })();
      const value = r.requiredText ?? r.required ?? r.value ?? r.rdata ?? r.target;
      if (r.type && value !== undefined && value !== null) {
        push({
          type: r.type as 'A' | 'AAAA' | 'TXT' | 'CNAME',
          domain: setDomain,
          value: String(value),
          required_action: recordAction as 'add' | 'remove',
        });
      }
    }
  };

  // Shape 1: requiredDnsUpdates with desired/discovered/checking split.
  // - `desired[]` = records the user must ADD to verify the domain
  //   (typically a CNAME pointing at `<site>.web.app` for subdomains,
  //    or A records pointing at Firebase's IPs for apex domains).
  // - `discovered[]` = records currently at the user's registrar that
  //   CONFLICT with the desired ones and must be REMOVED for verification
  //   to succeed (this is where the user's existing A records to their
  //   old hosting end up).
  // - `checking[]` = records currently being verified (treat as add).
  for (const set of domainData.requiredDnsUpdates?.desired || []) {
    walkRecords(set, 'add');
  }
  for (const set of domainData.requiredDnsUpdates?.discovered || []) {
    walkRecords(set, 'remove');
  }
  for (const set of domainData.requiredDnsUpdates?.checking || []) {
    walkRecords(set, 'add');
  }
  // Older shape: `checks[]` (single flat array, individual records carry
  // their own action via `domainUpdateAction`).
  for (const set of domainData.requiredDnsUpdates?.checks || []) {
    walkRecords(set, 'add');
  }

  // Shape 2: dnsRecordSets[] — newer API top-level. Same record-level
  // action handling as above.
  const sets = domainData.dnsRecordSets || domainData.dnsUpdates?.dnsRecordSets || [];
  for (const s of sets) {
    walkRecords(s, 'add');
  }

  // Shape 3: provisioning.dnsStatus[] — legacy domains endpoint
  const dnsStatus = domainData.provisioning?.dnsStatus || [];
  for (const ds of dnsStatus) {
    if (ds.expectedIps) {
      for (const ip of ds.expectedIps) {
        push({ type: 'A', domain: fallbackDomain, value: ip, required_action: 'add' });
      }
    }
    if (ds.discoveredIps) {
      for (const ip of ds.discoveredIps) {
        push({ type: 'A', domain: fallbackDomain, value: ip, required_action: 'verify' });
      }
    }
  }

  // Shape 4: legacy provisioning.expectedIps + dnsTokens
  if (domainData.provisioning?.expectedIps) {
    for (const ip of domainData.provisioning.expectedIps) {
      push({ type: 'A', domain: fallbackDomain, value: ip, required_action: 'add' });
    }
  }
  if (domainData.provisioning?.dnsTokens) {
    for (const tok of domainData.provisioning.dnsTokens) {
      push({ type: 'TXT', domain: fallbackDomain, value: tok, required_action: 'add' });
    }
  }

  return out;
}
