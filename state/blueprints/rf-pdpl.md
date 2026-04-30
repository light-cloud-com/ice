# Blueprint — `packages/ui/src/features/deploy/components/deploy-panel.tsx`

**Source**: 2229 LOC. **Decomposer run**: 2026-04-29.
**Public API**: single named export `DeployPanel`; no internal shims needed.

## Modules (24 units)

### Layer 0 — utils
- **rf-pdpl-1** `utils/provider-regions.ts` (~40 LOC, L71–138) — `PROVIDER_REGIONS`, `PROVIDER_LABELS`, `PROVIDER_PROJECT_LABELS`, `detectDominantProvider(nodes)`.
- **rf-pdpl-2** `utils/open-external-url.ts` (~10 LOC, L1481–1484) — `openExternalUrl(url)`. 8 callsites.
- **rf-pdpl-3** `utils/dns-records.ts` (~45 LOC, L664–714) — `extractDnsResults`, `splitDnsByAction`, `DnsRec` type.
- **rf-pdpl-4** `utils/results-summary-text.ts` (~35 LOC, L1996–2018) — `buildResultsSummaryText`, `summaryCounts`. **RISK #9**: preserve ✓/✗ glyphs.
- **rf-pdpl-5** `utils/error-classification.ts` (~50 LOC, L1652–1718) — `classifyDeployError`, `collectApiEnableUrls`, `extractProjectIdFromError`, `QUOTA_PATTERN`. **RISK #10**: preserve regex verbatim.

### Layer 1 — leaf subcomponents
- **rf-pdpl-6** `components/status-badge.tsx` (~50 LOC, L1223–1270). **RISK #8**: returns null for unknown statuses (load-bearing).
- **rf-pdpl-7** `components/plan-preview.tsx` (~80 LOC, L1399–1476). Co-locates ChangeRow.
- **rf-pdpl-8** `components/sections/auth-banner.tsx` (~25 LOC, L626–635).
- **rf-pdpl-9** `components/sections/deployed-resources-list.tsx` (~25 LOC, L600–624).
- **rf-pdpl-10** `components/sections/log-panel.tsx` (~25 LOC, L768–781). **RISK #6**: ref must come from useDeployEffects.
- **rf-pdpl-11** `components/sections/dns-records-section.tsx` (~110 LOC, L660–765). **RISK #7**: keep `outputs as any` cast at util boundary.
- **rf-pdpl-12** `components/destroy-confirm-modal.tsx` (~135 LOC, L1836–1980). **RISK #11**: createPortal + Esc listener owned by modal.
- **rf-pdpl-13** `components/deploy-node-row.tsx` (~85 LOC, L1133–1221). **RISK #3**: React.memo boundary — separate module from DeployInFlightPanel.

### Layer 2 — composing
- **rf-pdpl-14** `components/deploy-in-flight-panel.tsx` (~70 LOC, L1043–1131). React.memo + useMemo on deriveRollup.
- **rf-pdpl-15** `components/results-summary.tsx` (~245 LOC, L1982–2229). Largest module; flag if >280 during impl.
- **rf-pdpl-16** `components/banners/quota-error-banner.tsx` (~140 LOC, L1496–1635). 4-state machine.

### Layer 3 — composing banners + section with state
- **rf-pdpl-17** `components/banners/api-error-banner.tsx` (~135 LOC, L1637–1832). Switches on classifyDeployError.
- **rf-pdpl-18** `components/sections/config-section.tsx` (~125 LOC, L1272–1397). **RISK #5**: parallel network paths with orchestrator (intentional).
- **rf-pdpl-19** `components/deploy-controls.tsx` (~165 LOC, L805–960). Footer buttons + cancel-fetch.

### Layer 4 — hooks (Redux + side-effects)
- **rf-pdpl-20** `hooks/use-deploy-actions.ts` (~210 LOC, L233–528). **RISK #2**: retry-after-auth re-dispatches startPlanning/startDeploying — keep verbatim.
- **rf-pdpl-21** `hooks/use-deploy-effects.ts` (~140 LOC, L165–229 + 303–377). **RISK #1**: 4 effects in one hook with overlapping deps; preserve order.
- **rf-pdpl-22** `hooks/use-destroy-action.ts` (~80 LOC, L967–1027). **RISK #4**: startDestroying BEFORE await — order is observable to canvas overlay.

### Final
- **rf-pdpl-23** orchestrator slim-down to ~250–300 LOC.
- **rf-pdpl-24** final housekeeping (no public-API shims needed).

## Behavior-risk flags (12 total)

1. **useDeployEffects 4-effect bundle**: keep in one hook with comments verbatim (the "Don't gate on slice status here" comment at L303 is load-bearing).
2. **use-deploy-actions retry-after-auth**: handlePlan/handleDeploy re-dispatch start* before retry. Don't pull retry into a helper.
3. **DeployNodeRow React.memo boundary**: separate module from DeployInFlightPanel; collapsing re-renders every row.
4. **use-destroy-action ordering**: startDestroying → await API → clearCardDeployOverlay → setDeployedResources([]) → resetDeploy(). Don't reorder.
5. **ConfigSection parallel network**: provider.isConnected runs both in orchestrator (auto-fill once) and ConfigSection (refresh on change). Keep both.
6. **logEndRef auto-scroll**: hook must stay unconditional (not gated by `if (!isOpen) return null`).
7. **DnsRecordsSection `outputs as any` cast**: keep at util boundary; switching to type guard changes runtime.
8. **StatusBadge null fallthrough**: returns null for unknown statuses (Redux transient state). Load-bearing.
9. **buildResultsSummaryText glyphs**: ✓/✗ Unicode preserved — E2E clipboard snapshots may match.
10. **classifyDeployError regex**: single regex with capture groups; OR-joined includes() drops semantics.
11. **DestroyConfirmModal createPortal + Esc**: listener must attach inside modal, not parent.
12. **gcpNodes alias**: don't rename in a single unit — flag for follow-up.

## Public API
Single named export `DeployPanel` from `packages/ui/src/features/deploy/components/deploy-panel.tsx`. Re-exported via `packages/ui/src/features/deploy/index.ts`. Mounted by `packages/ui/src/shared/components/main-layout.tsx`.
