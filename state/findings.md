# Findings — coverage sweep (2026-05-02)

Triage of bugs, dead code, and architecture surprises surfaced while
bringing workspace coverage from 8,261 → 13,231 tests. Each entry cites
its origin commit so the fix can land on the same branch.

**Status update (2026-05-02 PM)** — all 30 Tier 1, all 16 Tier 2,
AND all 8 Tier 3 findings have landed on `refactoring`; commits not
yet pushed to remote per user request. Each fix has its own commit
with an inverted regression test (where applicable — Tier 3 entries
are mostly documentation-only because they're judgment calls).

**Tier 3 (closed 2026-05-02 PM)** — #47 (diff null↔empty equivalence),
#48 (diff nested `_`-skip), #49 (diff array-of-objects positional —
documented), #50 (graph-slice empty-container hide — documented as
dormant), #51 (ui-slice panes[0]? fallbacks — documented as
dormant), #52 (team-page null-org guard — documented as dormant),
#53 (createProvider sync/async divergence — documented), #54
(NullProvider streamChat throws on first iteration).

**Tier 2 (closed 2026-05-02 PM)** — #31 (svg-connection-path arrows),
#32 (use-canvas-mouse-events orphan), #33 (desktop tsc artifacts),
#34 (terraform/pulumi dead error branch), #35 (architecture-rules
incoming Map — already done with #19), #36 (deploy/structure-rules
redundant nodeType), #37 (deploy-rules tautology), #38 (connection-
rules unreachable label fallback), #39 (property-rules unreachable
guard), #40 (mock-provider 'deleted' branch), #41 (provider-registry
duplicate-warn), #42 (provider-registry health-check lazy doc),
#43 (canvas/cards try/catch), #44 (project-members shared
middleware), #45 (templates/validate.ts unit-testable), #46
(requireProjectAccess single query).

**Sweep complete: 54 / 54 findings closed.** Branch `refactoring`
has 50+ commits ahead of `main` across this multi-day session,
none pushed yet.

## Tier 1 — Security / correctness bugs (fix soon)

### Auth / authorization

✅ **All 30 Tier 1 findings fixed in this sweep:**
#1 (JWT_SECRET gate), #2 (requireProjectAccess fail-open),
#3 (refresh-token over-deletion), #4 (web/app.tsx trust model),
#5 (invite-accept email-bind + URL-encode), #6 (last-owner guards),
#7 (canvas getOrgId body fallback), #8 (webhooks idempotency hang),
#9 (unified-type-resolver Result shape), #10 (FORCE_NEW_PROPERTIES),
#11 (azure type-mapper static_site), #12 (use-ai-command SSE),
#13 (deleteEnvironment in-flight check), #14 (createEnvironment errors),
#15 (bootstrapProductionEnvironment mismatch), #16 (validateCanvas validatedBy),
#17 (OpenAICompatProvider.healthCheck auth), #18 (chat finishReason),
#19 (architecture-rules Redis), #20 (connection-rules phantom cycle),
#21 (audit silent fire-and-forget), #22 (canvas-intent SSE error),
#23 (apply-engine AbortSignal — between layers + between batches,
in-flight ops not interrupted, `cancelled` flag on result),
#24 (apply-engine success-vs-error), #25 (apply-engine replace skip warn),
#26 (GCP CLEAN_PROPERTY_EXTRACTORS), #27 (GCP importer access-denied),
#28 (use-clipboard cut), #29 (environments thunk guard), #30 (setActive guards).

Tier 1 closed. Next: Tier 2 cleanup pass.

1. **JWT_SECRET falls back to literal `'test-secret'`** when
   `NODE_ENV === 'test'`. Any process started with that env (CI, dev
   scripts, accidentally-staged) signs production-shaped tokens with
   a known string. _Origin_: `services/iam/src/routes/auth.ts:15-21`.
   _Fix_: tighten the gate (`import.meta.vitest` or a dedicated
   `IS_VITEST` env, not `NODE_ENV`).

2. **`requireProjectAccess` fails open on unknown `minRole`**.
   `(ROLE_LEVEL[pm.role] || 0) < (ROLE_LEVEL[minRole] || 0)`
   collapses an unknown minRole to 0; a viewer (level 1) then
   satisfies it. Route effectively becomes auth-required-only if the
   minRole type ever loosens. _Origin_:
   `packages/shared/src/auth/middleware.ts`. _Fix_: throw at
   handler-build time if minRole isn't in `ROLE_LEVEL`.

3. **Refresh-token reuse-detection over-deletes the family** when a
   row is missing — a stolen token can log out the legitimate user.
   _Origin_: `services/iam/src/services/auth.service.ts` BE-3.
   _Fix_: scope deletion to the suspected token only; mark the
   family as compromised separately.

4. **`web/app.tsx` has NO auth gating at the App shell** — routes
   render unconditionally. `/templates`, `/settings`, `/onboarding`
   are reachable without a token. Onboarding redirect (the only
   client-side gate) lives inside `DynamicContent`, not at App.
   _Origin_: `packages/web/src/app/app.tsx`. _Fix_: gate at the App
   shell or document client-side trust model.

5. **`invite-accept.tsx` auth check is the SOLE barrier**. The
   redirect-token round-trip (`navigate('/login?redirect=/invite/
   <token>')`) is the only thing protecting the accept-invite
   endpoint. Token isn't URL-encoded. _Origin_:
   `packages/web/src/pages/invite-accept.tsx`. _Fix_: server-side
   validation on `/users/invite/accept`, plus `encodeURIComponent`
   on the token in the redirect.

6. **No `cannot-remove-last-admin` guard at any layer**. UI hides
   nothing extra; project-members route just dispatches the delete.
   _Origin_: `services/canvas/src/routes/project-members.ts`,
   `packages/ui/src/features/account/components/team-page.tsx`.
   _Fix_: add a count-of-admins check at the service or DB-trigger
   layer.

7. **`canvas/canvas.ts /projects` list trusts body
   `organisationId` fallback** when JWT is missing. Mild
   org-spoofing surface. _Origin_:
   `services/canvas/src/routes/canvas.ts:getOrgId`. _Fix_: drop the
   body fallback or document why it's intentional.

### Correctness

8. **`webhooks.ts:57` async catch handler hangs the request**.
   Express 4 has no default async-error handler — non-P2002 prisma
   errors leave the request hanging until the client times out.
   _Origin_: `services/deploy/src/routes/webhooks.ts:57`. _Fix_:
   wrap in the same try/catch shape used at lines 85-96.

9. **`unified-type-resolver` only populates type maps for the legacy
   `{ data: { schemas: [...] } }` payload shape**. The Result-shaped
   response that `query()` actually returns gets silently swallowed.
   If the schema provider was migrated to Result shape, the
   resolver is no-op. _Origin_:
   `packages/core/src/schema/unified-type-resolver.ts`. _Fix_:
   handle both shapes or normalize on the provider side.

10. **`FORCE_NEW_PROPERTIES` table is partially dead** in
    `core/src/plan/diff.ts`. `normalize_resource_type` rewrites
    every `_` to `.` before lookup, but several map keys *contain*
    `_` (e.g. `azure.compute.virtual_machine`,
    `gcp.sql.database_instance`, `azure.storage.storage_account`).
    Those entries are silently unreachable; destructive changes to
    those resources won't trigger the destroy/recreate flow.
    _Origin_: `packages/core/src/plan/diff.ts`. _Fix_: rewrite the
    keys to use `.` consistently, or skip normalization on the
    map-lookup path.

11. **`azure-importer/type-mapper.ts:40` dead key**.
    `'microsoft.web/staticSites'` (capital S) is in TYPE_MAP, but
    `get_ice_type` lowercases input before lookup. Microsoft.Web/
    staticSites falls through to the synthesized
    `azure.web.staticsites` instead of intended
    `azure.web.static_site`. _Origin_:
    `packages/core/src/importers/azure/type-mapper.ts`. _Fix_:
    lowercase the key, or skip lowercasing on lookup.

12. **`use-ai-command` SSE parser resets `eventType`/`eventData`
    per `read()` call** — multi-chunk-spanning SSE events silently
    drop. _Origin_: `packages/ui/src/features/ai/hooks/
    use-ai-command.ts`. _Fix_: persist parser state across reads.

13. **`canvas/environment.service.deleteEnvironment` doesn't check
    in-flight deploys**. Relies on FK cascade only. _Origin_:
    `services/canvas/src/services/environment.service.ts`.
    _Fix_: query active deployment rows + reject delete.

14. **`canvas/environment.service.createEnvironment` swallows ALL
    trigger-rule errors** (incl. auth/permission failures from
    `deploymentRule.create`). User gets a green path even when
    zero rules cloned. _Origin_: same file. _Fix_: rethrow
    non-best-effort errors; downgrade to warning only for
    expected-skip cases.

15. **`canvas/environment.service.bootstrapProductionEnvironment`
    short-circuits on existing-prod without comparing inputs**.
    Stale callsite that thinks it's seeding gets back the old env
    unchanged. _Origin_: same file. _Fix_: compare requested
    name/userId/cardId; if they don't match, throw or update.

16. **`canvas/canvas-validation.service.validateCanvas` swallows
    core-engine import failures with `valid: true`**. Frontend
    can't distinguish "engine down" from "canvas truly clean".
    _Origin_: `services/canvas/src/services/canvas-validation.
    service.ts`. _Fix_: return `{ valid: true, validatedBy:
    'engine' | 'skipped' }` so the frontend can see the
    distinction.

17. **`OpenAICompatProvider.healthCheck` swallows ALL errors** from
    `/health` and silently falls through to `/v1/models`. A 401 on
    `/health` is treated identically to "endpoint missing". _Origin_:
    `packages/ai/src/providers/openai-compat.ts`. _Fix_: distinguish
    network errors from auth failures; surface auth.

18. **`OpenAICompatProvider.chat` always reports `finishReason:
    'stop'`** — discards the wire-level finish reason. _Origin_:
    same file. _Fix_: thread the wire's finish reason through.

19. **`architecture-rules.ts` else-if classifier shadowing**.
    `Database.Redis` matches `isDatabase` first (Database. prefix),
    so it lands in `databases`, never in `caches`. The
    `MULTI_DB_NO_CACHE` suppression branch is unreachable for any
    real Redis node. _Origin_:
    `packages/core/src/validation/architecture-rules.ts:62-65`.
    _Fix_: order isCache before isDatabase, or have isDatabase
    exclude Redis explicitly.

20. **`connection-rules.ts` cycle detector includes dangling
    targets** — phantom-cycle reports `a → ghost → a` when an edge
    has a non-existent target. _Origin_:
    `packages/core/src/validation/connection-rules.ts:135`. _Fix_:
    filter dataEdges by node-existence, or move cycle-detect above
    the dangling-edge skip.

21. **`ai/audit.service.writeAuditEntry` silent fire-and-forget** —
    audit-log DB outage drops entries with zero observability.
    _Origin_: `services/ai/src/services/ai-audit.service.ts`.
    _Fix_: at minimum `console.error` on rejection; better, wire
    into the deploy log channel.

22. **`canvas-intent` SSE error-after-headers risk** — error catch
    fires `res.status(500).json(...)` without guarding on
    `res.headersSent`. _Origin_: `services/ai/src/routes/ai.ts`.
    _Fix_: `if (res.headersSent) return; else res.status(500)...`.

23. **`apply-engine.ts` no abort_signal / cancellation support**.
    Legacy engine; mid-flight cancel is ignored. Rollback callers
    run to layer completion regardless. _Origin_:
    `packages/core/src/apply/apply-engine.ts`. _Fix_: thread an
    `AbortSignal` through; check between layers.

24. **`apply-engine.ts` success-vs-error mismatch**. Handler
    returning `{ success: false }` with no `error` field results in
    summary "1 failed" while overall result says success=true.
    _Origin_: same file. _Fix_: derive overall success from the
    summary not from `errors.length`.

25. **`apply-engine.ts` replace path silently skips destroy** when
    `current_state` is missing — different from the scheduler's
    stricter destroy/create choreography. _Origin_: same file.
    _Fix_: log a warning; skip only when explicitly "create-only"
    semantics requested.

26. **GCP `CLEAN_PROPERTY_EXTRACTORS` dead-eyed fallbacks**.
    `props.name || extractName(props.name as string)` — when
    `props.name` is undefined, `extractName(undefined)` returns
    undefined too. The "extract from URL" path never fires for
    missing-name cases. _Origin_:
    `packages/core/src/importers/gcp/type-mapper.ts`. _Fix_:
    `extractName(props.self_link)` — pass the URL field
    explicitly.

27. **GCP importer access-denied "success"**. Reports `success:
    true` if ALL errors are ACCESS_DENIED — may mask real
    permission misconfigurations. _Origin_:
    `packages/core/src/importers/gcp/gcp-importer.ts`. _Fix_:
    distinguish "no permission" (warning, partial success) from
    "all permissions denied" (error).

### State / data integrity

28. **`use-clipboard` cut-path data-loss risk**. `writeText` reject
    + sessionStorage fallback also fails → nodes are STILL deleted.
    _Origin_: `packages/ui/src/shared/hooks/use-clipboard.ts`.
    _Fix_: gate the delete on a successful write of either path.

29. **`environments.tsx` `is_protected` only checked at UI render**.
    Manual delete dispatch could bypass. _Origin_:
    `packages/web/src/pages/project/environments.tsx` + the
    `deleteEnvironment` thunk. _Fix_: thunk-level check.

30. **`projects-slice.setActiveProject` and
    `environments-slice.setActiveEnvironment` don't validate id**
    — set even for unknown ids. _Origin_:
    `packages/ui/src/store/slices/{projects,environments}-slice.ts`.
    _Fix_: gate on existence in state.

## Tier 2 — Dead code / cleanup

31. **`svg-connection-path.tsx` arrow markup is dead**.
    `hasArrow = false` is hardcoded at line 125 with comment
    "Arrows removed" — the entire `<marker>` block (lines 278-288)
    and `markerEnd` truthy branch (line 318) is unreachable.

32. **`use-canvas-mouse-events.ts` is orphan code**. No consumers
    in the workspace; only mentioned in a JSDoc reference in
    `canvas-constants.ts`. 399 LOC of dead React-hook plumbing.
    _Action_: delete the file + the JSDoc reference. (Tests can be
    deleted with it.)

33. **Stale `index.js` / `index.d.ts` artifacts** under
    `apps/desktop/src/{main,preload}/` from a past `tsc --emit`
    run. They're git-tracked and collide with Vite's `.js`-over-
    `.ts` resolver. _Action_: remove from the repo + add to
    `.gitignore`.

34. **Same dead error branch in terraform/pulumi converters**:
    `errors.push(result.error)` in `export_graph` is structurally
    unreachable. `node_to_resource` always co-emits
    `unmapped: true` with any error. _Action_: drop the redundant
    branch or assert it as a contract violation.

35. **`architecture-rules.ts:38,44,46` unused `incoming` Map** —
    built but never read. _Action_: drop.

36. **`deploy-rules.ts:175` redundant nodeType check** —
    `node.type === 'container' || 'group'` after `isContainer(...)`
    already returns true for those values. Same shape at
    `structure-rules.ts:128`. _Action_: drop the redundant check.

37. **`deploy-rules.ts:225` tautology** — `length > 0 ? '...' :
    undefined` inside `if (length > 0)`. _Action_: drop the
    ternary.

38. **`connection-rules.ts:70-71` unreachable label fallback** —
    `'Source' / 'Target'` arms after `iceType.split('.').pop()`
    only fire for iceType `'.'`. _Action_: drop.

39. **`property-rules.ts:237` unreachable defensive guard** —
    caller already gates on `prop.customInput` truthy. _Action_:
    drop.

40. **`mock-provider default_state_generator 'deleted'` branch is
    dead code** — destroy doesn't call the generator through the
    public ProviderClient interface. _Action_: drop the branch or
    document it as a future hook.

41. **`provider-registry.register()` silently overrides on
    duplicate key**. _Fix_: `console.warn` on collision (or throw
    in dev mode).

42. **`provider-registry.health_check_all()` only checks
    instantiated clients** — registered-but-unused providers are
    invisible. _Fix_: instantiate-on-first-health-check, or
    document the lazy semantics.

43. **`canvas/canvas.ts cards/{create,delete}` lack try/catch** —
    outliers among the file's other handlers; unhandled-rejection
    becomes 500 envelope-less. _Fix_: wrap consistently.

44. **`canvas/project-members.ts` re-implements project-owner
    gating** via `hasProjectAccess(req.userId, projectId, 'owner')`
    instead of using shared `requireProjectAccess('owner')`
    middleware. _Fix_: switch to the middleware.

45. **`templates/validate.ts` calls `process.exit(1)` at
    module-import time** — script that's not unit-testable as-is.
    _Fix_: extract `runValidation(...)` and keep a thin
    `if (require.main === module)` driver.

46. **`requireProjectAccess` does 2 prisma round-trips** despite
    BE-10 comment claiming single query. _Fix_: fold the org-member
    lookup into the project's `select` clause.

## Tier 3 — Subtle / debatable

47. **`core/diff.ts` null vs `[]` / `null` vs `{}` treated as
    different** — false-positive vector for drift detection when
    providers return `null` for omitted lists.

48. **`core/diff.ts` `_`-prefix internal-skip is top-level only** —
    nested `_` keys diff in detailed mode.

49. **`core/diff.ts` arrays of objects compared positionally not by
    id** — reordering produces a parent-path drift record.

50. **`graph-slice.ts:181` empty-container hide branch unreachable**
    through current callers (all use viewLevel=2).

51. **`ui-slice.ts:332/350` defensive `panes[0]?` fallback
    unreachable** — initialized non-empty and `closeSplit` keeps
    ≥1 pane.

52. **`team-page.ts:86` defensive null-org guard unreachable** —
    role `<select>` only renders when isAdmin, which derives from
    selectedOrg.role.

53. **`createProvider` (sync) vs `createProviderAsync` produce
    different providers** for the same config. _Action_: document
    or normalize.

54. **`NullProvider.streamChat` yields one `undefined` chunk before
    throwing** — a consumer not checking chunk.content silently
    processes an undefined token. Code blames eslint
    require-yield. _Action_: throw immediately, suppress the
    eslint rule on that one function.
