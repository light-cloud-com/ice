# Blueprint — `packages/core/src/deploy/providers/gcp/handlers/cloud-storage.ts`

**Source**: 856 LOC. **Decomposer run**: 2026-04-30.
**Public API**: `cloud_storage_handler: GCPResourceHandler` (consumed by `gcp-deployer.ts` L17). Not re-exported through any `index.ts`.

## Modules (8 units)

### Layer 0 — pure utils

- **rf-cstor-1** `cloud-storage/result-helpers.ts` (~50 LOC, L11–43) — `result()`, `fail()`, `TYPE = 'gcp.storage.bucket'`. Pattern-identical to `firebase-hosting/result-helpers.ts`; do NOT merge — separate resource types, separate TYPE constants. Imports `ResourceDeployResult` from `'../../../../types.js'`.

- **rf-cstor-2** `cloud-storage/bucket-utils.ts` (~60 LOC) — `placeholderIndexHtml(bucketName)` (RISK #1 — call-time `new Date().toISOString()`); `placeholderNotFoundHtml(bucketName)`; `resolveOutputUrl(publicAccess, grantFailed, name, indexPage)`. Pure helpers used by both create and update. Extracted from create L341–392 / L442–459 and update L686–730 / L766–774.

### Layer 1 — bucket creation + adoption

- **rf-cstor-3** `cloud-storage/bucket-creator.ts` (~150 LOC, L58–190) — **HIGHEST-RISK UNIT.** `createOrAdoptBucket(storage, name, createOptions, publicAccess, ctx): Promise<{ ublaForcedOn: boolean; bucketAlreadyExisted: boolean }>`. Two-tier creation retry: optimistic UBLA-off + ACL → on UBLA constraint, retry with UBLA-on; on "already exists" (409 or message probe), adopt path with metadata fetch + UBLA-disable attempt. RISK #2 (UBLA retry inner "already exists" guard 3 conditions). RISK #3 (adopted-bucket UBLA-disable must re-throw non-UBLA errors).

### Layer 2 — public-access grant (shared between create and update)

- **rf-cstor-4** `cloud-storage/public-access-granter.ts` (~170 LOC, create L192–325 / update L509–678) — `grantPublicAccess(bucket, name, ublaForcedOn, ctx, opts: { verifyAfterWrite: boolean }): Promise<{ strategy, failed, error, warnings }>`. Single implementation of IAM → legacy-ACL fallback used by both methods. Update calls with `verifyAfterWrite: true`; create with `false` (asymmetry preserved per source). RISK #4 (IAM merge not replace). RISK #5 (UBLA-forced + IAM-blocked dual-block short-circuits ACL). RISK #6 (ACL dual calls: `acl.default.add` + `acl.add` best-effort). RISK #7 (request policy version 3, write back with original version).

### Layer 3 — placeholder upload

- **rf-cstor-5** `cloud-storage/placeholder-uploader.ts` (~90 LOC, create L338–430 / update L685–764) — `uploadPlaceholders(bucket, name, publicAccess, ublaForcedOn, publicGrantStrategy, bucketAlreadyExisted, ctx): Promise<string[]>`. Skip-if-exists for index.html + 404.html (RISK #8). `predefinedAcl: 'publicRead'` only when `publicAccess && !ublaForcedOn`. ACL backfill on existing files when `bucketAlreadyExisted && publicAccess && publicGrantStrategy === 'legacy-acl'`.

### Layer 4 — update simple-properties

- **rf-cstor-6** `cloud-storage/bucket-updater.ts` (~40 LOC, L489–499) — `applySimpleProperties(bucket, properties): Promise<void>`. Labels + lifecycle + versioning patches; intentionally narrow.

### Final

- **rf-cstor-7** Orchestrator slim-down to ~240 LOC. `cloud-storage.ts` retains: imports, `create()` body (thin coordinator: resolve → buildCreateOptions inline → createOrAdoptBucket → grantPublicAccess → uploadPlaceholders → assemble), `update()` body (similar with `applySimpleProperties` first + `verifyAfterWrite: true`), `delete()` verbatim (22 LOC), `describe()` verbatim (25 LOC).

- **rf-cstor-8** Final housekeeping. Add `cloud-storage/index.ts` barrel re-exporting `cloud_storage_handler` so `gcp-deployer.ts` import path is unchanged. Verify typecheck + coverage.

## Behavior-risk flags (8 total)

1. **`new Date().toISOString()` in placeholder HTML** — call-time eval; don't memoize.
2. **UBLA retry inner "already exists" guard** — must check 3 conditions (`'you already own it'` / `'already own this bucket'` / `.code === 409`). Missing one bubbles a real 409 unhandled.
3. **Adopted-bucket UBLA-disable re-throw on non-UBLA errors** — catch branch only sets `ublaForcedOn = true` when error includes UBLA constraint string.
4. **IAM policy merge, not replace** — `setPolicy` replaces; must fetch + find-or-insert `roles/storage.objectViewer` + push `allUsers` + write with original etag + version.
5. **UBLA-forced + IAM-blocked dual block short-circuits ACL** — when `ublaForcedOn` true, do NOT attempt `bucket.acl.default.add`; set `failed = true` immediately.
6. **ACL dual calls** — `bucket.acl.default.add` (default-object ACL) AND `bucket.acl.add(...).catch(() => undefined)` (bucket-level, best-effort) both required.
7. **`verifyAfterWrite` asymmetry** — update passes `true` (re-fetches policy post-write to detect silent org-policy stripping); create passes `false`. Adding verify to create changes behavior.
8. **Placeholder skip-if-exists independent guards** — `index.html` and `404.html` exists() each wrapped in `.catch(() => [false])`; skips are independent.

## Public API

| Export                  | Kind                       | Consumed by           | Notes                                                        |
| ----------------------- | -------------------------- | --------------------- | ------------------------------------------------------------ |
| `cloud_storage_handler` | `GCPResourceHandler` const | `gcp-deployer.ts` L17 | Direct named import; not re-exported through any `index.ts`. |

No re-export shims required at package level. The barrel `cloud-storage/index.ts` (rf-cstor-8) resolves the import path at handlers directory level, keeping `gcp-deployer.ts` unchanged.

## Sub-module directory layout

```
handlers/
  cloud-storage.ts                  ← orchestrator (~240 LOC after rf-cstor-7)
  cloud-storage/
    result-helpers.ts               ← rf-cstor-1
    bucket-utils.ts                 ← rf-cstor-2
    bucket-creator.ts               ← rf-cstor-3 ★ highest-risk
    public-access-granter.ts        ← rf-cstor-4
    placeholder-uploader.ts         ← rf-cstor-5
    bucket-updater.ts               ← rf-cstor-6
    index.ts                        ← rf-cstor-8 (barrel)
```
