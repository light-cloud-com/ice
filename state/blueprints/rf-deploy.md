# Blueprint — `services/deploy/src/services/deploy.service.ts`

**Source**: 2843 LOC. **Decomposer run**: 2026-04-29.
**Public-API consumers** (must keep working): `services/deploy/src/index.ts`, `services/deploy/src/routes/canvas-deploy.ts`, `services/deploy/src/services/queue.service.ts`, `services/deploy/src/services/google-verification.service.ts`.
**Existing tests**: `services/deploy/src/__tests__/{deploy-event-translation,drift-detection,rollback,build-validation}.test.ts`.

`deploy.service.ts` keeps its 13 public exports — the file becomes a thin orchestrator that imports the modules below. All extractions are code-shape only.

## Modules

### `services/deploy/src/services/snapshot-persister.ts` (service-helper, ~70 LOC, lines 47–102)

- `installSnapshotPersister(): void`
- `flushSnapshotNow(cardId: string): Promise<void>`
- deps_in: `@ice/db`, `./deploy-locks`
- deps_out: `deploy.service.ts` (init + apply finally)

### `services/deploy/src/utils/deploy-event-formatter.ts` (util, ~35 LOC, lines 170–205)

- `describeEventForLog(event: DeployEvent): string`
- `mapStatusToOverlay(status: DeployNodeStatus): string`
- deps_in: `@ice/types`
- deps_out: `deploy.service.ts` (re-exports `mapStatusToOverlay` for public API)
- Note: contract-coupling comment with `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts` — comment moves with the module.

### `services/deploy/src/utils/deploy-outcome.ts` (util, ~95 LOC, lines 276–345 + 364–381)

- `computeCompleteTotals(resources: any[] | undefined): DeployCompleteEvent['totals']`
- `deriveCompleteOutcome(resources, opts?: { cancelled?; engineSuccess? }): DeployCompleteEvent['outcome']`
- `computeDeploySummary(result: any): Record<string, number>`
- deps_in: `@ice/types`
- deps_out: `deploy.service.ts` apply / rollback / destroy-all complete-event blocks. Already covered by `deploy-event-translation.test.ts`.

### `services/deploy/src/services/deploy-event-dispatcher.ts` (service-helper, ~120 LOC, lines 104–217 + 219–274)

- `emitDeployEvent(cardId: string, event: DeployEvent): void`
- `emitLog(cardId, message, level?): void`
- `emitDestroyNodeStatus(cardId, payload): void`
- deps_in: `@ice/shared` wire emitters, `./deploy-event-log`, `./deploy-locks`, `../utils/deploy-event-formatter`
- deps_out: every emit callsite in deploy.service.ts (apply scheduler callbacks, destroy loops, complete events, logs)

### `services/deploy/src/utils/project-context.ts` (util — DB-touching, ~35 LOC, lines 389–426)

- `resolveProjectContext(cardId: string): Promise<{ projectId; projectName; environmentType }>`
- deps_in: `@ice/db`
- deps_out: `planDeployment`, `applyDeployment` runBody.

### `services/deploy/src/services/deployer-factory.ts` (service-helper, ~30 LOC, lines 383–387 + 4 callsite duplicates)

- `createDeployer(provider: string): Promise<any>`
- `getCoreEngine(): Promise<any>`
- deps_in: dynamic `@ice/core`
- deps_out: apply / destroy / destroyAll / rollback (4 currently-duplicated `if aws… else if azure… else GCP` blocks at 786–795, 1517–1521, 1841–1848, 2151–2158).
- Duplicate-removal exception to the ~30 LOC rule.

### `services/deploy/src/utils/find-source-node-id.ts` (util, ~70 LOC, lines 889–953)

- `buildResourceNameMaps(deployables): { nameToNodeId; nameToLabel; graphIdToCanvasId }`
- `makeFindSourceNodeId(args: { nameToNodeId; persistedMap }): (res) => string | undefined`
- deps_in: none (pure)
- deps_out: apply runBody (replaces inline closure 921–953 + maps 892–919).

### `services/deploy/src/services/scheduler-callbacks.ts` (service-helper, ~110 LOC, lines 964–1072 + duplicate 1133–1178)

- `makeSchedulerCallbacks(args: { cardId; graphIdToCanvasId; totalResources; totalsRef })` returning `{ on_node_status, on_node_progress, on_log, on_resource_result }`
- deps_in: `./deploy-event-dispatcher`, `./deploy-locks`, `../utils/deploy-event-formatter`
- deps_out: apply (replaces inline callback object) + auto-cleanup retry callbacks (second instance becomes a re-call with the same factory, with an `omit` option for the subset shape).

### `services/deploy/src/services/quota-retry.ts` (service-helper, ~110 LOC, lines 1099–1199) — **flag for own coverage**

- `retryAfterQuotaCleanup(args): Promise<void>` (mutates `result` in place)
- deps_in: `./orphan-cleanup.service`, `./deploy-event-dispatcher`, dynamic `getCoreEngine`
- deps_out: apply runBody (replaces 1099–1199).

### `services/deploy/src/services/baseline-graph.ts` (service-helper, ~55 LOC, lines 824–874 + rollback duplicate 2192–2225)

- `buildBaselineGraph(args: { cardId; environment; excludeDeploymentId? }): Promise<{ currentGraph; foundCount }>`
- deps_in: `@ice/db`, dynamic `@ice/core/graph` (`MutableGraph`)
- deps_out: apply runBody (824–874) + `rollbackDeployment` (2192–2225).
- **Param flag**: rollback's variant filters `status: 'success'` only; apply's filters `status: { in: ['success', 'partial'] }`. Pass through.

### `services/deploy/src/services/destroy-targets.ts` (service-helper, ~110 LOC, lines 1400–1493 + 1551–1562)

- `collectDestroyAllTargets(cardId): Promise<{ targets; provider; latestRow }>`
- `orderTargetsForDelete<T extends { type }>(targets: T[]): T[]`
- `resolveDestroyAllProject(args): string | null`
- deps_in: `@ice/db`
- deps_out: `destroyAllForCard`.

### `services/deploy/src/services/destroy-runner.ts` (service-helper, ~140 LOC, lines 1580–1661 + 1900–2006) — **BEHAVIOR-RISK**

- `runDestroyLoop(args): Promise<{ deleted; failed }>`
- deps_in: `@ice/db`, `./deploy-event-dispatcher`
- deps_out: `destroyDeployment` (1901–2006) + `destroyAllForCard` (1582–1661).
- **Risk**: `destroyDeployment` filters `res.success && res.provider_id`; `destroyAllForCard` iterates `targets.values()` regardless of historical success. Runner must accept a `selector` so both rules are preserved.

### `services/deploy/src/services/deploy-lock-wrapper.ts` (service-helper, ~45 LOC, lines 567–583 + 3 duplicates)

- `withDeployLock<T>(cardId, action, body, opts?): Promise<T>`
- deps_in: `./deploy-locks`
- deps_out: apply 568–583, destroyDeployment 1742–1752, destroyAllForCard 1391–1397, rollback 2086–2094.

### `services/deploy/src/services/gcp-api-enabler.ts` (service-helper, ~190 LOC, lines 2637–2843)

- `enableGcpApi(project, apiName, accessToken): Promise<boolean>`
- `autoEnableGCPApis(project, accessToken, canvasNodes, log): Promise<void>`
- consts `ICE_TYPE_API_MAP`, `BASE_APIS`
- deps_in: fetch
- deps_out: apply (818) + `google-verification.service.ts` (already imports `enableGcpApi` from `./deploy.service.js` — that import switches over). Orchestrator re-exports `enableGcpApi`.

### `services/deploy/src/services/canvas-overlay.ts` (service-helper, ~145 LOC, lines 2319–2478)

- `getNodeDeploymentOverlay(cardId, environment?): Promise<Record<string, any>>`
- deps_in: `@ice/db`
- deps_out: re-exported by orchestrator; `routes/canvas-deploy.ts` unchanged.

### `services/deploy/src/services/drift.service.ts` (service-helper, ~125 LOC, lines 2480–2615)

- `checkDrift(cardId, nodes, options?): Promise<{ driftResults; checkedAt; unsupported }>`
- deps_in: `@ice/db`, `@ice/service-credentials`, `../providers/registry`, `./deployer-factory`
- deps_out: re-exported by orchestrator; `drift-detection.test.ts` already passes through public API.

## Dependency DAG (leaves first)

```
Layer 0 (pure leaves — no project deps)
  utils/deploy-event-formatter.ts
  utils/deploy-outcome.ts
  utils/find-source-node-id.ts

Layer 1 (DB or core only)
  utils/project-context.ts
  services/deployer-factory.ts
  services/gcp-api-enabler.ts
  services/baseline-graph.ts
  services/destroy-targets.ts

Layer 2 (depend on Layer 0)
  services/snapshot-persister.ts
  services/deploy-lock-wrapper.ts
  services/deploy-event-dispatcher.ts

Layer 3 (depend on Layer 2 dispatcher)
  services/scheduler-callbacks.ts
  services/destroy-runner.ts
  services/canvas-overlay.ts

Layer 4 (compose Layer 3)
  services/quota-retry.ts
  services/drift.service.ts

Layer 5 (orchestrator)
  services/deploy.service.ts → all of the above
```

## Unit ordering for the planner

1. **rf-deploy-1** — `utils/deploy-event-formatter.ts`
2. **rf-deploy-2** — `utils/deploy-outcome.ts`
3. **rf-deploy-3** — `utils/find-source-node-id.ts`
4. **rf-deploy-4** — `utils/project-context.ts`
5. **rf-deploy-5** — `services/deployer-factory.ts` (dedups 4 callsites)
6. **rf-deploy-6** — `services/gcp-api-enabler.ts` (touches `google-verification.service.ts` import)
7. **rf-deploy-7** — `services/snapshot-persister.ts`
8. **rf-deploy-8** — `services/deploy-lock-wrapper.ts` (4-callsite dedup)
9. **rf-deploy-9** — `services/deploy-event-dispatcher.ts` (foundation for callback modules)
10. **rf-deploy-10** — `services/baseline-graph.ts`
11. **rf-deploy-11** — `services/destroy-targets.ts`
12. **rf-deploy-12** — `services/scheduler-callbacks.ts`
13. **rf-deploy-13** — `services/destroy-runner.ts` (BEHAVIOR-RISK)
14. **rf-deploy-14** — `services/quota-retry.ts`
15. **rf-deploy-15** — `services/canvas-overlay.ts`
16. **rf-deploy-16** — `services/drift.service.ts`
17. **rf-deploy-17** — shim-drop / orchestrator slim-down audit
