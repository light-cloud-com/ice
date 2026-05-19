# Blueprint — `packages/ui/src/features/properties/components/properties-panel.tsx`

**Source**: 3268 LOC. **Decomposer run**: 2026-04-29.
**Public-API consumer**: top-level layout slot in App.tsx (default export of `PropertiesPanel`). Re-exports stay; only the internal composition changes.

## Broker prework (cross-package dedups already flagged)

- **`parseCostRange` + `formatCost`** already exist canonically at `packages/ui/src/features/cost/utils/cost-calculator.ts` (registry anchors `parse-cost-range`, `format-cost`). Three call sites (this file at L114-125 + `shared/components/status-bar.tsx` + the canonical home). The canonical version handles `Free` / commas / decimals; the local version doesn't and `formatCost` returns `''` for zero where canonical returns `'Free'`. **Treat as a behavior-change-risk dedup unit at the very end of the rf-props series, not as a copy-and-rename during extraction.**
- **`normalizeSubdomain`** exists at `custom-domain/index.tsx:107` and inline twice in this file. Reconcile to one canonical home; flag for critic that the edge-subdomain version's truncation order is strictly dominant.
- **`parseQueue`** exists at `message-queue/index.tsx:34` with a *different shape* (`QueueView` vs `QueueSpec`). Don't merge.

## Modules

### `packages/ui/src/features/properties/utils/queue-spec.ts` (util, ~22 LOC, lines 402–421)
- `interface QueueSpec`, `parseQueue(raw): QueueSpec`, `stringifyQueue(q): string`

### `packages/ui/src/features/properties/utils/normalize-subdomain.ts` (util, ~28 LOC, lines 972–993 + 1763–1774)
- `normalizeSubdomain(raw): string`, `validateSubdomain(s): string | null`
- Pick the edge-subdomain order (truncate-after-trim) — strictly dominant.

### `packages/ui/src/features/properties/utils/edge-warnings.ts` (util, ~30 LOC, lines 880–895)
- `computeEdgeWarnings(srcIceType, tgtIceType, t): Array<{ level; message; suggestion? }>`

### `packages/ui/src/features/properties/utils/format-age.ts` (util, ~12 LOC, lines 2272–2280 + 3099–3107 — duplicate-removal)
- `formatAge(date): string`

### `packages/ui/src/features/properties/utils/deploy-history-format.ts` (util, ~60 LOC, lines 2877–2949)
- `ACTION_LABELS`, `ACTION_COLORS`, `formatDeployRow(d)`

### `packages/ui/src/features/properties/components/fields/index.tsx` (component-bundle, ~280 LOC, lines 291–579)
Single file with multiple named exports — NOT a barrel. The no-barrel rule forbids re-export hubs, not co-located primitives.
- `Section`, `TextField`, `NumberField`, `SelectField`, `ListField`, `QueueListField`, `StepperField`, `PropertyLabel`, `CustomValueInput`

### `packages/ui/src/features/properties/components/fields/render-property-field.tsx` (component-factory, ~175 LOC, lines 52–110 + 581–755)
- `renderPropertyField(prop, value, onChange, nodeData?)`, `PropertyFields` component
- Types: `HighLevelProperty`, `OptionDetail`, `CustomInputConfig`, `ResourceDef`, `ResourceCategory`, `ProviderImpl`

### `packages/ui/src/features/properties/hooks/use-resource-map.ts` (hook, ~32 LOC, lines 772–796)
- `useResourceMap(): Map<string, ResourceDef>`. Silent-on-fail effect — preserve.

### `packages/ui/src/features/properties/hooks/use-property-issues.ts` (hook, ~18 LOC, lines 806–815) — fold-in candidate
- `usePropertyIssues(selectedNodeId): Map | undefined`. Lean fold-in into `use-resource-map`.

### `packages/ui/src/features/properties/hooks/use-active-env-name.ts` (hook, ~12 LOC, lines 818–821) — inline candidate
- `useActiveEnvName(projectId): string`. Lean inline if not duplicated.

### `packages/ui/src/features/properties/hooks/use-drift-check.ts` (hook, ~35 LOC, lines 251–269)
- `useDriftCheck(cardId, nodes): { isLoading; checkDrift }`

### `packages/ui/src/features/properties/components/sections/drift.tsx` (subcomponent, ~100 LOC, lines 185–289)
- `DriftIndicator`, `DriftCheckButton`

### `packages/ui/src/features/properties/components/sections/group-color-picker.tsx` (subcomponent, ~50 LOC, lines 129–181)
- `GroupColorPicker`

### `packages/ui/src/features/properties/components/sections/edge-properties-section.tsx` (subcomponent, ~245 LOC, lines 870–1111)
- `EdgePropertiesSection`. Stays Redux-coupled.

### `packages/ui/src/features/properties/components/sections/scaling-section.tsx` (subcomponent, ~50 LOC, lines 1410–1451)
- `ScalingSection`

### `packages/ui/src/features/properties/components/sections/domain-section.tsx` (subcomponent, ~35 LOC, lines 1454–1483)
- `PublicEndpointDomainSection`

### `packages/ui/src/features/properties/components/sections/custom-domain-panel.tsx` (subcomponent, ~260 LOC, lines 1726–1987)
- `CustomDomainPanel`, `interface CustomDomainRoute`. Candidate for follow-up split (RoutesList + DnsRecordsList) — defer.

### `packages/ui/src/features/properties/components/sections/private-network-panel.tsx` (subcomponent, ~175 LOC, lines 1989–2165)
- `PrivateNetworkPanel`. Keeps inline `PrivateNetworkPolicySection`. **Preserve `data-testid="pn-${direction}-..."` attributes.**

### `packages/ui/src/features/properties/components/sections/connection-card.tsx` (subcomponent, ~75 LOC, lines 3014–3087)
- `ConnectionCard`

### `packages/ui/src/features/properties/components/sections/env-vars-editor.tsx` (subcomponent, ~60 LOC, lines 3209–3268)
- `EnvVarsEditor`

### `packages/ui/src/features/properties/components/sections/pipeline-section.tsx` (subcomponent, ~300 LOC, lines 2169–2466)
- `PipelineSection`. Three dynamic imports — relative paths change after move, test must cover.

### `packages/ui/src/features/properties/components/sections/service-source-section.tsx` (subcomponent, ~56 LOC, lines 2470–2523)
- `ServiceSourceSection`

### `packages/ui/src/features/properties/components/sections/source-repository-section.tsx` (subcomponent, ~350 LOC, lines 2527–2873)
- `SourceRepositorySection`

### `packages/ui/src/features/properties/components/sections/repo-deploy-list.tsx` (subcomponent, ~120 LOC, lines 3091–3207)
- `RepoDeployList`

### `packages/ui/src/features/properties/components/sections/deploy-history.tsx` (subcomponent, ~130 LOC, lines 2877–3012)
- `DeployHistory`

### `packages/ui/src/features/properties/components/sections/project-overview.tsx` (subcomponent, ~75 LOC, lines 858–867 + 1644–1707)
- `ProjectOverview`

### `packages/ui/src/features/properties/components/sections/node-properties-section.tsx` (subcomponent, ~530 LOC, lines 1113–1641) — **split into two units**
- `NodePropertiesSection` — tab-router + per-tab dispatch. Split per the planner's call: (a) tab-router shell with setState-during-render fallback intact, (b) per-tab body extraction.

### `packages/ui/src/features/properties/components/properties-panel.tsx` (orchestrator, ~120 LOC final)
- Default `PropertiesPanel` only. Composes the three top-level branches: edge / node / project-overview. Default export preserved.

## Dependency DAG (leaves first)

```
LEAVES:
  utils/queue-spec.ts
  utils/normalize-subdomain.ts
  utils/edge-warnings.ts
  utils/format-age.ts
  utils/deploy-history-format.ts

LAYER 1:
  components/fields/index.tsx                  ← queue-spec
  hooks/use-resource-map.ts
  hooks/use-property-issues.ts (or fold in)
  hooks/use-active-env-name.ts (or inline)
  hooks/use-drift-check.ts

LAYER 2:
  components/fields/render-property-field.tsx  ← fields
  sections/drift.tsx                           ← use-drift-check
  sections/group-color-picker.tsx
  sections/connection-card.tsx
  sections/env-vars-editor.tsx                 ← fields
  sections/scaling-section.tsx                 ← fields
  sections/domain-section.tsx                  ← fields
  sections/custom-domain-panel.tsx             ← fields, normalize-subdomain
  sections/private-network-panel.tsx           ← fields
  sections/repo-deploy-list.tsx                ← fields, format-age
  sections/service-source-section.tsx          ← fields
  sections/deploy-history.tsx                  ← fields, deploy-history-format
  sections/pipeline-section.tsx                ← fields, format-age

LAYER 3:
  sections/source-repository-section.tsx       ← fields, repo-deploy-list, pipeline-section
  sections/edge-properties-section.tsx         ← fields, edge-warnings, normalize-subdomain
  sections/project-overview.tsx                ← fields + canonical cost-calculator

LAYER 4:
  sections/node-properties-section.tsx         ← every Layer 1-3 section + render-property-field

ROOT:
  properties-panel.tsx                         ← edge-section, node-section, project-overview, hooks
```

## Behavior-risk flags

1. **parseCostRange/formatCost dedup is a behavior change**, not pure code-shape. Local strictly less capable than canonical. Sequence as a **separate unit at the END** of the rf-props series, after sections land. Critic must flag a behavior-equivalence diff.

2. **NodePropertiesSection (~530 LOC) has setState-during-render** at L1280–1284 (`setPropsTab(visibleTabs[0].id)` during render — React tolerates). Split into tab-router shell + per-tab body in TWO units. Preserve the setState's exact JSX position.

3. **PipelineSection + SourceRepositorySection use dynamic `import('../../../store/...')`**. Relative paths change after extraction. Static typecheck won't catch wrong relative paths inside string literals — test-author must cover the dynamic-import path.

4. **renderPropertyField wraps each field with `data-prop-key={prop.name}`** (E2E selectors depend on this). Preserve verbatim.

5. **CustomDomainPanel is rendered TWICE** (domain tab + config tab). Identical props in both call sites; any selector reshuffle that gives different `selectedNode` references would re-mount and lose `<input>` cursor position during typing.

6. **useResourceMap silently swallows fetch errors** (load-bearing for offline/dev-server). Document with a comment; don't add error handling.

7. **PrivateNetworkPolicySection has `data-testid="pn-${direction}-..."`** referenced from E2E. Preserve verbatim.

8. **normalizeSubdomain inline-twice with subtly different ordering**. Edge version (truncate-after-trim) strictly dominates. Pick edge order; document why in the new util.

9. **PipelineSection `handleRetry` has unnecessary double-dynamic-import** at L2260–2269. Don't clean up in extraction — flag follow-up.

## Unit ordering for the planner

1. **rf-props-1** — `utils/queue-spec.ts`
2. **rf-props-2** — `utils/normalize-subdomain.ts`
3. **rf-props-3** — `utils/edge-warnings.ts`
4. **rf-props-4** — `utils/format-age.ts`
5. **rf-props-5** — `utils/deploy-history-format.ts`
6. **rf-props-6** — `components/fields/index.tsx` (the field primitives bundle)
7. **rf-props-7** — `hooks/use-resource-map.ts` (+ fold-in `use-property-issues.ts`)
8. **rf-props-8** — `hooks/use-drift-check.ts`
9. **rf-props-9** — `components/fields/render-property-field.tsx`
10. **rf-props-10** — `sections/drift.tsx`
11. **rf-props-11** — `sections/group-color-picker.tsx`
12. **rf-props-12** — `sections/connection-card.tsx`
13. **rf-props-13** — `sections/env-vars-editor.tsx`
14. **rf-props-14** — `sections/scaling-section.tsx` + `sections/domain-section.tsx` (both small; same brief)
15. **rf-props-15** — `sections/custom-domain-panel.tsx` (BEHAVIOR-RISK: rendered twice)
16. **rf-props-16** — `sections/private-network-panel.tsx`
17. **rf-props-17** — `sections/repo-deploy-list.tsx`
18. **rf-props-18** — `sections/service-source-section.tsx`
19. **rf-props-19** — `sections/deploy-history.tsx`
20. **rf-props-20** — `sections/pipeline-section.tsx` (BEHAVIOR-RISK: dynamic imports)
21. **rf-props-21** — `sections/source-repository-section.tsx`
22. **rf-props-22** — `sections/edge-properties-section.tsx`
23. **rf-props-23** — `sections/project-overview.tsx`
24. **rf-props-24a** — `sections/node-properties-section.tsx` shell + tab-router (BEHAVIOR-RISK)
25. **rf-props-24b** — per-tab body extraction
26. **rf-props-25** — orchestrator slim-down (the final compose-and-route shell)
27. **rf-props-26** — `parseCostRange`/`formatCost` cross-file dedup to canonical home (BEHAVIOR-CHANGE — separate unit at the end)
