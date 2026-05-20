# Blueprint — `packages/core/src/deploy/providers/gcp/handlers/firebase-hosting.ts`

**Source**: 1140 LOC. **Decomposer run**: 2026-04-30.
**Public API**: `firebase_hosting_handler: GCPResourceHandler` (consumed by `gcp-deployer.ts` L21) + `FirebaseHostingDnsRecord` (exported interface; UI types its own `DnsRec` locally — server-side schema contract). Neither is re-exported through `packages/core/src/deploy/index.ts` or the GCP `index.ts`.

## Modules (11 units)

### Layer 0 — pure utils (no async, no ctx)

- **rf-fbh-1** `firebase-hosting/result-helpers.ts` (~55 LOC, L40–76) — `result()`, `fail()`. The `TYPE` constant (`'gcp.firebase.hosting'`) lives here because both helpers embed it. Imports `ResourceDeployResult` from `'../../../types.js'`. Deepest leaf — zero intra-package imports.

- **rf-fbh-2** `firebase-hosting/site-utils.ts` (~45 LOC, L78–111) — `sanitizeSiteId()`, `placeholderIndexHtml()`. Both pure. `placeholderIndexHtml` embeds `new Date().toISOString()` (RISK #1). HTML body verbatim (RISK #2).

- **rf-fbh-3** `firebase-hosting/tar-parser.ts` (~75 LOC, L228–275) — `FileEntry` interface + `parseTar()`. Self-contained. RISK #3 (block alignment, EOF, ustar prefix concat, `Math.ceil(size/512)*512` arithmetic).

### Layer 1 — REST transport + site provisioning

- **rf-fbh-4** `firebase-hosting/rest-client.ts` (~65 LOC, L113–164) — `RestResponse` interface + `restRequest()`. Holds `FIREBASE_HOSTING_API` + `FIREBASE_MGMT_API` constants. RISK #4 (`validateStatus: () => true` always-true; `acceptStatuses` inclusion gate).

- **rf-fbh-5** `firebase-hosting/site-provisioner.ts` (~80 LOC, L171–226) — `ensureFirebaseProject()`, `ensureHostingSite()`. RISK #5 (409/400 dual-meaning + message-content probe). RISK #6 (`ensureHostingSite` 409 re-fetch path).

### Layer 2 — content pipeline

- **rf-fbh-6** `firebase-hosting/github-downloader.ts` (~110 LOC, L282–371) — `downloadGitHubRepo()`. Imports `gunzipSync`, `parseTar`/`FileEntry`. RISK #7 (silent fallback when outputDirectory matches no files). RISK #8 (`globalThis.fetch` vs `requestRaw` dual path for codeload auth bypass).

- **rf-fbh-7** `firebase-hosting/version-publisher.ts` (~130 LOC, L386–496) — `publishVersion()`, `publishPlaceholderVersion()`, `parseRepository()`. RISK #9 (SHA256 over GZIPPED payload). RISK #10 (5-step protocol: create → populateFiles → upload → PATCH FINALIZED → POST release; verbatim sequence).

### Layer 2 — domain registration + DNS extraction

- **rf-fbh-8** `firebase-hosting/dns-extractor.ts` (~110 LOC, L513–526 + L661–777) — `FirebaseHostingDnsRecord` interface (exported) + `extractDnsRecords()`. RISK #11 (four distinct API response shapes — all preserved). RISK #12 (`domainUpdateAction` per-record override).

- **rf-fbh-9** `firebase-hosting/domain-registrar.ts` (~125 LOC, L539–659) — `registerHostingDomain()`. **HIGHEST-RISK UNIT.** RISK #13 (project-scoped path `projects/${ctx.project}/sites/${siteId}`). RISK #14 (three-tier fallback: GET → customDomains → legacy domains; each 409 re-fetches independently; legacy body shape is verbatim).

### Final

- **rf-fbh-10** orchestrator slim-down to ~220 LOC. `firebase-hosting.ts` retains imports + `firebase_hosting_handler` export with `create`, `update`, `delete`, `describe`. Each method body is a thin coordinator. The `delete` method's 400-means-default-site handling stays in the orchestrator.

- **rf-fbh-11** final housekeeping. Barrel `firebase-hosting/index.ts` re-exports `firebase_hosting_handler` and `FirebaseHostingDnsRecord` so `gcp-deployer.ts`'s import path is unchanged. Verify zero regressions.

## Behavior-risk flags (14 total)

1. **`new Date().toISOString()` in placeholder HTML** — call-time eval, time-sensitive snapshots will fail. Don't memoize.

2. **Placeholder HTML verbatim** — inline `<style>`, ✓ glyph (U+2713), all copy preserved byte-for-byte (Firebase hashes for dedup).

3. **Tar parser edge cases**: (a) EOF on first zero-block (not two-block GNU); (b) octal size parsing `parseInt(sizeField, 8)`; (c) `Math.ceil(size/512)*512` for empty files (size=0 → 0); (d) `Buffer.from(data)` copy avoids retaining decompressed buffer.

4. **`validateStatus: () => true`** — always-true means `res.ok` checks are the only guard. Don't add partial validators.

5. **`ensureFirebaseProject` 409/400 dual-meaning** — message-content probe (`'already'`/`'ALREADY_EXISTS'`) disambiguates; pure status check would mis-classify genuine 400s.

6. **`ensureHostingSite` adoption** — three-condition check `getRes.ok && getRes.status !== 404 && getRes.data?.name` required.

7. **GitHub silent fallback** — when outputDirectory matches no files, falls back to repo root and warns. Non-throwing by design.

8. **GitHub fetch auth bypass** — `globalThis.fetch` branch omits auth headers (codeload rejects them); `requestRaw` fallback preserved for envs without global fetch.

9. **SHA256 over gzipped bytes** — Firebase requires hash of compressed payload, not raw. Hashing `f.bytes` directly fails uploads.

10. **5-step version publish sequence** — create → populateFiles → upload → PATCH FINALIZED → POST release. Server-enforced state machine; no reorder/parallelize.

11. **Four DNS response shapes** — `requiredDnsUpdates.*`, `dnsRecordSets`, `provisioning.dnsStatus`, `provisioning.expectedIps/dnsTokens`. All preserved; no early return.

12. **Per-record `domainUpdateAction` override** — individual records can override set-level action. `toUpperCase()` coercion + ADD/REMOVE matching verbatim.

13. **Project-scoped custom-domain path** — `projects/${ctx.project}/sites/${siteId}` (not bare `sites/${siteId}`). Legacy endpoint at L621 also requires project prefix.

14. **Three-tier domain registration fallback** — GET-first (adopt) → POST customDomains → POST legacy domains. Legacy body shape (`domainRedirect.type: 'TEMPORARY'`, `provisioning.certStatus: 'CERT_PREPARING'`) verbatim.

## Public API

| Export                     | Kind                       | Consumed by                                                       | Notes                                                                |
| -------------------------- | -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `firebase_hosting_handler` | `GCPResourceHandler` const | `gcp-deployer.ts` L21                                             | Direct named import; not re-exported through any `index.ts`.         |
| `FirebaseHostingDnsRecord` | exported interface         | No direct cross-package import. UI uses its own `DnsRec` locally. | Authoritative schema for `custom_domain_dns_records`. Keep exported. |

No re-export shims required. Orchestrator stays at `handlers/firebase-hosting.ts` (or barrel resolving same import path).
