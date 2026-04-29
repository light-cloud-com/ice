# Shared modules

**Owner**: util-broker. **Append-only** — never edit past entries.

This is a registry of every exported util, hook, or helper across the workspace, used to short-circuit duplication during refactoring. Each entry: kebab-case `##` anchor, `_Indexed: YYYY-MM-DD by util-broker_` line, signature, path, one-line purpose.

The util-broker rescans before each refactor unit and appends any new entries. Cross-package duplicates discovered during a scan are also recorded so the planner can schedule dedup units against them.

---

## cn

_Indexed: 2026-04-29 by util-broker_

`cn(...inputs: ClassValue[]): string`
Path: `packages/ui/src/shared/utils/cn.ts`
Purpose: clsx + tailwind-merge wrapper for conditional Tailwind class names.

## to-slug

_Indexed: 2026-04-29 by util-broker_

`toSlug(name: string): string`
Path: `packages/ui/src/shared/utils/slug.ts`
Purpose: Lowercase + non-alphanumeric → `-` slug; falls back to `'org'` on empty.

## log-canvas-render

_Indexed: 2026-04-29 by util-broker_

`logCanvasRender(data: { nodeCount; edgeCount; visibleCount; viewLevel: number }): void`
Path: `packages/ui/src/shared/utils/debug-logger.ts`
Purpose: Gated `console.debug` for canvas render cycles (toggled by `localStorage['ice-debug']`).

## log-blueprint

_Indexed: 2026-04-29 by util-broker_

`logBlueprint(data: { type; provider?; childCount; containerWidth; containerHeight }): void`
Path: `packages/ui/src/shared/utils/debug-logger.ts`
Purpose: Gated debug log for blueprint expansion events.

## log-drop

_Indexed: 2026-04-29 by util-broker_

`logDrop(data: { position; targetContainer?; nodeType }): void`
Path: `packages/ui/src/shared/utils/debug-logger.ts`
Purpose: Gated debug log for palette drop events.

## log-api-call

_Indexed: 2026-04-29 by util-broker_

`logApiCall(method: string, path: string, body?: unknown): void`
Path: `packages/ui/src/shared/utils/action-logger.ts`
Purpose: Pushes structured API request event to `window.__ICE_ACTION_LOG__` (E2E test buffer).

## log-api-response

_Indexed: 2026-04-29 by util-broker_

`logApiResponse(method, path: string, status: number, data: unknown, duration_ms: number): void`
Path: `packages/ui/src/shared/utils/action-logger.ts`
Purpose: Pushes structured API response event to action-log buffer; auto-classifies 4xx+ as `api_error`.

## log-state-change

_Indexed: 2026-04-29 by util-broker_

`logStateChange(actionType: string, payload?: unknown): void`
Path: `packages/ui/src/shared/utils/action-logger.ts`
Purpose: Records Redux dispatch as structured action-log event.

## auto-layout

_Indexed: 2026-04-29 by util-broker_

`autoLayout(nodes: LayoutNode[], edges: LayoutEdge[], options?: LayoutOptions): LayoutResult`
Path: `packages/ui/src/shared/utils/auto-layout.ts`
Purpose: Dagre-based hierarchical tree layout with circular fallback; recursively sizes nested containers.

## calculate-z-index

_Indexed: 2026-04-29 by util-broker_

`calculateZIndex(iceType: string, depth?: number): number`
Path: `packages/ui/src/shared/utils/auto-layout.ts`
Purpose: Resolves SVG paint-order z-index from iceType + nesting depth (VPC=0, Subnet=10, Group=15, container=20, leaf=100).

## force-resolve-overlaps

_Indexed: 2026-04-29 by util-broker_

`forceResolveOverlaps<T extends ForceBody>(allNodes: T[], gap?: number, ticks?: number, strength?: number): void`
Path: `packages/ui/src/shared/utils/auto-layout.ts`
Purpose: Velocity-damped sim that pushes overlapping top-level nodes apart; mutates x/y in place.

## is-api-not-enabled-error

_Indexed: 2026-04-29 by util-broker_

`isApiNotEnabledError(error: string): boolean`
Path: `packages/ui/src/shared/utils/gcp-errors.ts`
Purpose: Pattern-matches GCP error strings for the "API not enabled / disabled" case.

## extract-api-name

_Indexed: 2026-04-29 by util-broker_

`extractApiName(errorOrUrl: string): string | null`
Path: `packages/ui/src/shared/utils/gcp-errors.ts`
Purpose: Pulls the GCP API service name (e.g. `compute.googleapis.com`) out of an error or enable URL.

## extract-api-enable-url

_Indexed: 2026-04-29 by util-broker_

`extractApiEnableUrl(error: string): string | null`
Path: `packages/ui/src/shared/utils/gcp-errors.ts`
Purpose: Returns the Cloud Console enable URL embedded in (or constructable from) a GCP error.

## build-api-enable-url

_Indexed: 2026-04-29 by util-broker_

`buildApiEnableUrl(apiName: string, project?: string): string`
Path: `packages/ui/src/shared/utils/gcp-errors.ts`
Purpose: Constructs `https://console.cloud.google.com/apis/api/<api>/overview` (optionally with `?project=`).

## inspect-layout

_Indexed: 2026-04-29 by util-broker_

`inspectLayout(state: InspectState, opts?: InspectOptions): InspectResult`
Path: `packages/ui/src/shared/utils/layout-inspector.ts`
Purpose: Browser-console layout inspector — dumps node positions, gaps, overlaps, and container fit.

## update-inspector-state

_Indexed: 2026-04-29 by util-broker_

`updateInspectorState(state: InspectState): void`
Path: `packages/ui/src/shared/utils/layout-inspector.ts`
Purpose: Refreshes the cached state used by `window.__iceInspect()`; called on every canvas render.

## install-inspector

_Indexed: 2026-04-29 by util-broker_

`installInspector(): void`
Path: `packages/ui/src/shared/utils/layout-inspector.ts`
Purpose: Binds `window.__iceInspect` / `__iceInspectVerbose` for manual canvas inspection.

## use-system-stats

_Indexed: 2026-04-29 by util-broker_

`useSystemStats(intervalMs?: number): { ram: number; cpu: number } | null`
Path: `packages/ui/src/shared/hooks/use-system-stats.ts`
Purpose: Polls `/system/stats` on an interval; returns RAM/CPU or null.

## compute-candidate-fingerprint

_Indexed: 2026-04-29 by util-broker_

`computeCandidateFingerprint(edges, nodes, terminalNodeId: string): string`
Path: `packages/ui/src/shared/hooks/use-log-stream.ts`
Purpose: Stable string projection of inbound log-source candidates; used as effect dep so subscribe re-runs on deploy_status flip.

## use-log-stream

_Indexed: 2026-04-29 by util-broker_

`useLogStream(terminalNodeId: string): { status; entries; source; lastError }`
Path: `packages/ui/src/shared/hooks/use-log-stream.ts`
Purpose: Owns the full subscribe → join → listen → unsubscribe lifecycle for a Cloud Logging terminal node.

## use-gcp-oauth

_Indexed: 2026-04-29 by util-broker_

`useGCPOAuth(onSuccess: () => void): { connecting; error; connect }`
Path: `packages/ui/src/shared/hooks/use-gcp-oauth.ts`
Purpose: Google Identity Services authorization-code flow → POST code to backend → onSuccess callback.

## use-resolve-path

_Indexed: 2026-04-29 by util-broker_

`useResolvePath(allSegments: string[]): ResolvedPath`
Path: `packages/ui/src/shared/hooks/use-resolve-path.ts`
Purpose: Resolves URL path segments → folder/project IDs + breadcrumbs for both community and platform editions.

## use-clipboard

_Indexed: 2026-04-29 by util-broker_

`useClipboard(): void`
Path: `packages/ui/src/shared/hooks/use-clipboard.ts`
Purpose: Wires Ctrl+C/X/V/G keyboard shortcuts to canvas node copy/cut/paste/group via Redux.

## use-reduced-motion

_Indexed: 2026-04-29 by util-broker_

`useReducedMotion(): boolean`
Path: `packages/ui/src/shared/hooks/use-reduced-motion.ts`
Purpose: Tracks `prefers-reduced-motion` media query with live updates.

## use-exposed-services

_Indexed: 2026-04-29 by util-broker_

`useExposedServices(visibleNodes, edges, allNodes?): { nodeIds: string[]; userIconPosition }`
Path: `packages/ui/src/shared/hooks/use-exposed-services.ts`
Purpose: Detects true public entry-point nodes (WAF/LB/CDN/Gateway sources) for the canvas user-icon overlay.

## use-menu-actions

_Indexed: 2026-04-29 by util-broker_

`useMenuActions(): void`
Path: `packages/ui/src/shared/hooks/use-menu-actions.ts`
Purpose: Subscribes to Electron menu events and dispatches matching Redux actions (new/open/save/undo/redo/zoom/etc).

## theme-provider

_Indexed: 2026-04-29 by util-broker_

`<ThemeProvider>` + `useTheme(): ThemeContextValue`
Path: `packages/ui/src/shared/hooks/use-theme.tsx`
Purpose: Light/dark mode + font-size context with localStorage persistence and `prefers-color-scheme` follow.

## use-undo-redo

_Indexed: 2026-04-29 by util-broker_

`useUndoRedo(): void`
Path: `packages/ui/src/shared/hooks/use-undo-redo.ts`
Purpose: Wires Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y to `undoCardChange` / `redoCardChange`.

## encrypt-credentials

_Indexed: 2026-04-29 by util-broker_

`encryptCredentials(data: Record<string, string>): string` / `decryptCredentials(encrypted: string): Record<string, string>`
Path: `packages/shared/src/crypto/index.ts`
Purpose: AES-256-GCM authenticated encryption for provider credential blobs (Node `crypto`).

## encrypt-string

_Indexed: 2026-04-29 by util-broker_

`encryptString(value: string): string` / `decryptString(encrypted: string): string`
Path: `packages/shared/src/crypto/index.ts`
Purpose: Single-string variant of credential encryption — used for GitHub tokens.

## require-auth

_Indexed: 2026-04-29 by util-broker_

`requireAuth(req: AuthRequest, res: Response, next: NextFunction): Response | void`
Path: `packages/shared/src/auth/middleware.ts`
Purpose: Express middleware — JWT validation, with desktop-mode bypass when a local user is set.

## require-project-access

_Indexed: 2026-04-29 by util-broker_

`requireProjectAccess(minRole: 'viewer' | 'editor' | 'owner'): RequestHandler`
Path: `packages/shared/src/auth/middleware.ts`
Purpose: Express middleware factory — checks org-admin OR project-member role ≥ `minRole` for `projectId`/`cardId`.

## require-org-role

_Indexed: 2026-04-29 by util-broker_

`requireOrgRole(...allowedRoles: string[]): RequestHandler`
Path: `packages/shared/src/auth/middleware.ts`
Purpose: Express middleware factory — checks org-membership role for org-scoped routes.

## generate-token

_Indexed: 2026-04-29 by util-broker_

`generateToken(userId, organisationId: string): string` / `generateRefreshToken(...): string`
Path: `packages/shared/src/auth/middleware.ts`
Purpose: Sign 1h access JWT or 30d refresh JWT (with `jti`).

## set-desktop-user

_Indexed: 2026-04-29 by util-broker_

`setDesktopUser(userId, orgId: string): void` / `isDesktopMode(): { userId; orgId } | null`
Path: `packages/shared/src/auth/middleware.ts`
Purpose: Toggle/inspect community-edition auth bypass (auto-seeded local user).

## setup-socket-service

_Indexed: 2026-04-29 by util-broker_

`setupSocketService(io: SocketServer): void` / `getSocketServer(): SocketServer | null`
Path: `packages/shared/src/socket/service.ts`
Purpose: Boots Socket.IO with JWT/desktop-mode auth and registers room subscribe/unsubscribe handlers.

## emit-deploy-node-status

_Indexed: 2026-04-29 by util-broker_

`emitDeployNodeStatus(cardId: string, event: DeployNodeStatusEvent): void`
Path: `packages/shared/src/socket/service.ts`
Purpose: Type-narrowed emitter for one deploy event variant; pushes to `deploy:<cardId>` room over `DEPLOY_EVENT_CHANNEL`.

## emit-deploy-node-progress

_Indexed: 2026-04-29 by util-broker_

`emitDeployNodeProgress(cardId: string, event: DeployNodeProgressEvent): void`
Path: `packages/shared/src/socket/service.ts`
Purpose: Type-narrowed emitter for per-node progress percentages.

## emit-deploy-complete

_Indexed: 2026-04-29 by util-broker_

`emitDeployComplete(cardId: string, event: DeployCompleteEvent): void`
Path: `packages/shared/src/socket/service.ts`
Purpose: Type-narrowed emitter for end-of-deploy summary.

## emit-deploy-log

_Indexed: 2026-04-29 by util-broker_

`emitDeployLog(cardId: string, event: DeployLogEvent): void`
Path: `packages/shared/src/socket/service.ts`
Purpose: Type-narrowed emitter for streaming deploy logs.

## emit-deploy-requirement-verified

_Indexed: 2026-04-29 by util-broker_

`emitDeployRequirementVerified(cardId: string, event: DeployRequirementVerifiedEvent): void`
Path: `packages/shared/src/socket/service.ts`
Purpose: Type-narrowed emitter for requirement-resolved events (DNS/SSL/etc).

## emit-canvas-update

_Indexed: 2026-04-29 by util-broker_

`emitCanvasUpdate(projectId: string, event: any): void`
Path: `packages/shared/src/socket/service.ts`
Purpose: Broadcasts canvas mutation to `canvas:<projectId>` collaboration room.

## emit-pipeline-update

_Indexed: 2026-04-29 by util-broker_

`emitPipelineUpdate(nodeId: string, event: PipelineStatusUpdate): void`
Path: `packages/shared/src/socket/service.ts`
Purpose: Pushes per-node pipeline status (full logs) to viewers of one node's pipeline panel.

## emit-card-pipeline-update

_Indexed: 2026-04-29 by util-broker_

`emitCardPipelineUpdate(cardId: string, event: CardPipelineUpdate): void`
Path: `packages/shared/src/socket/service.ts`
Purpose: Lightweight per-card pipeline status (no logs) for canvas badge updates.

## is-database

_Indexed: 2026-04-29 by util-broker_

`isDatabase(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True if iceType matches `Database.*` or known DB engines (Postgres/MySQL/etc).

## is-cache

_Indexed: 2026-04-29 by util-broker_

`isCache(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True if iceType references Redis/Cache/Memcache.

## is-queue

_Indexed: 2026-04-29 by util-broker_

`isQueue(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True if iceType is `Messaging.*` or known queue/event service.

## is-storage

_Indexed: 2026-04-29 by util-broker_

`isStorage(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True if iceType is `Storage.*` or known object-store service.

## is-backend

_Indexed: 2026-04-29 by util-broker_

`isBackend(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True if iceType is `Compute.*` or matches Backend/Container/Worker/Function.

## is-frontend

_Indexed: 2026-04-29 by util-broker_

`isFrontend(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for StaticSite/SSRSite/Frontend iceTypes.

## is-gateway

_Indexed: 2026-04-29 by util-broker_

`isGateway(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for Gateway/LoadBalancer/CDN entry-point types.

## is-auth

_Indexed: 2026-04-29 by util-broker_

`isAuth(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for Auth/IAM/Identity iceTypes.

## is-secrets

_Indexed: 2026-04-29 by util-broker_

`isSecrets(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for Secret/Vault iceTypes.

## is-monitoring

_Indexed: 2026-04-29 by util-broker_

`isMonitoring(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for Log/Monitor/Observability iceTypes.

## is-search

_Indexed: 2026-04-29 by util-broker_

`isSearch(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for Search/Elasticsearch/OpenSearch iceTypes.

## is-data-warehouse

_Indexed: 2026-04-29 by util-broker_

`isDataWarehouse(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for Warehouse/BigQuery/Redshift/Snowflake iceTypes.

## is-vector-db

_Indexed: 2026-04-29 by util-broker_

`isVectorDb(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for VectorDB/Pinecone/Weaviate iceTypes.

## is-llm

_Indexed: 2026-04-29 by util-broker_

`isLLM(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for LLM/AIGateway/AIModel iceTypes.

## is-repo

_Indexed: 2026-04-29 by util-broker_

`isRepo(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for Source.Repository / GitHub source-of-code iceTypes.

## is-env-config

_Indexed: 2026-04-29 by util-broker_

`isEnvConfig(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for Config.Env / EnvConfig iceTypes.

## is-domain

_Indexed: 2026-04-29 by util-broker_

`isDomain(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for CustomDomain/DNS iceTypes.

## is-custom-domain

_Indexed: 2026-04-29 by util-broker_

`isCustomDomain(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True specifically for `Network.CustomDomain`.

## is-private-network

_Indexed: 2026-04-29 by util-broker_

`isPrivateNetwork(t: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True for `Network.PrivateNetwork` (high-level VPC).

## is-container

_Indexed: 2026-04-29 by util-broker_

`isContainer(iceType: string, nodeType?: string): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True if iceType is a layout container (VPC/Subnet/Group/PrivateNetwork) — used by canvas + auto-layout.

## is-inside-container

_Indexed: 2026-04-29 by util-broker_

`isInsideContainer(nodeId: string, allNodes: NodeForConnectionCheck[]): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: Walks parentId chain to determine if a node lives inside any container ancestor.

## get-default-port

_Indexed: 2026-04-29 by util-broker_

`getDefaultPort(iceType: string): number | undefined`
Path: `packages/types/src/connection-rules.ts`
Purpose: Default TCP port for a given iceType (5432 for Postgres, 6379 for Redis, etc).

## get-env-var-name

_Indexed: 2026-04-29 by util-broker_

`getEnvVarName(iceType: string): string | undefined`
Path: `packages/types/src/connection-rules.ts`
Purpose: Conventional env-var name a service exports for downstream consumers (`DATABASE_URL`, `REDIS_URL`, etc).

## can-connect

_Indexed: 2026-04-29 by util-broker_

`canConnect(srcIceType, tgtIceType: string, srcNodeId?, tgtNodeId?, allNodes?): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True if `CONNECTION_RULES` allows the source→target pair (with optional containment context).

## find-connection-rule

_Indexed: 2026-04-29 by util-broker_

`findConnectionRule(srcIceType, tgtIceType: string): ConnectionRule | null`
Path: `packages/types/src/connection-rules.ts`
Purpose: Returns the single matching `CONNECTION_RULES` entry (or null) for an src→tgt pair.

## get-valid-target-ids

_Indexed: 2026-04-29 by util-broker_

`getValidTargetIds(srcId: string, allNodes, allEdges): string[]`
Path: `packages/types/src/connection-rules.ts`
Purpose: Returns IDs of every node a `srcId` could legally connect to right now.

## infer-connection-meta

_Indexed: 2026-04-29 by util-broker_

`inferConnectionMeta(src, tgt: string): ConnectionMeta`
Path: `packages/types/src/connection-rules.ts`
Purpose: Resolves category/color/lineStyle/port/envVar for an edge between two iceTypes.

## validate-connection

_Indexed: 2026-04-29 by util-broker_

`validateConnection(src, tgt: string, ...): ConnectionWarning[]`
Path: `packages/types/src/connection-rules.ts`
Purpose: Returns the list of warnings/errors for a proposed edge.

## would-create-cycle

_Indexed: 2026-04-29 by util-broker_

`wouldCreateCycle(src, tgt: string, allEdges): boolean`
Path: `packages/types/src/connection-rules.ts`
Purpose: True if adding src→tgt would close a cycle in the existing edge graph.

## generate-ai-connection-prompt

_Indexed: 2026-04-29 by util-broker_

`generateAiConnectionPrompt(): string`
Path: `packages/types/src/connection-rules.ts`
Purpose: Renders `CONNECTION_RULES` as a system-prompt fragment for the AI assistant.

## is-node-status-event

_Indexed: 2026-04-29 by util-broker_

`isNodeStatusEvent(e: DeployEvent): e is DeployNodeStatusEvent`
Path: `packages/types/src/deploy-events.ts`
Purpose: Discriminated-union narrowing for `node_status` deploy events.

## is-node-progress-event

_Indexed: 2026-04-29 by util-broker_

`isNodeProgressEvent(e: DeployEvent): e is DeployNodeProgressEvent`
Path: `packages/types/src/deploy-events.ts`
Purpose: Discriminated-union narrowing for `node_progress` deploy events.

## is-deploy-log-event

_Indexed: 2026-04-29 by util-broker_

`isDeployLogEvent(e: DeployEvent): e is DeployLogEvent`
Path: `packages/types/src/deploy-events.ts`
Purpose: Discriminated-union narrowing for streaming `log` deploy events.

## is-deploy-complete-event

_Indexed: 2026-04-29 by util-broker_

`isDeployCompleteEvent(e: DeployEvent): e is DeployCompleteEvent`
Path: `packages/types/src/deploy-events.ts`
Purpose: Discriminated-union narrowing for `complete` deploy events.

## is-requirement-verified-event

_Indexed: 2026-04-29 by util-broker_

`isRequirementVerifiedEvent(e: DeployEvent): e is DeployRequirementVerifiedEvent`
Path: `packages/types/src/deploy-events.ts`
Purpose: Discriminated-union narrowing for `requirement_verified` events.

## is-terminal-node-status

_Indexed: 2026-04-29 by util-broker_

`isTerminalNodeStatus(s: DeployNodeStatus): boolean`
Path: `packages/types/src/deploy-events.ts`
Purpose: True if a node-status is end-of-life (succeeded/failed/skipped/cancelled).

## success

_Indexed: 2026-04-29 by util-broker_

`success<T>(value: T): Success<T>` / `failure<E>(error: E): Failure<E>`
Path: `packages/core/src/types/result.ts`
Purpose: Constructors for the `Result<T, E>` discriminated union.

## is-success

_Indexed: 2026-04-29 by util-broker_

`is_success<T, E>(result: Result<T, E>): result is Success<T>` / `is_failure(...): result is Failure<E>`
Path: `packages/core/src/types/result.ts`
Purpose: Type guards for the `Result` union.

## unwrap

_Indexed: 2026-04-29 by util-broker_

`unwrap<T, E extends Error>(result): T` / `unwrap_or(result, default)` / `unwrap_or_else(result, fn)` / `unwrap_error(result): E`
Path: `packages/core/src/types/result.ts`
Purpose: Extract value (throw on failure) or apply default/error mapping.

## map-result

_Indexed: 2026-04-29 by util-broker_

`map<T, U, E>(result, fn): Result<U, E>` / `map_error(result, fn)` / `flat_map(result, fn)` / `or_else(result, fn)`
Path: `packages/core/src/types/result.ts`
Purpose: Functor/monad combinators over `Result`.

## all-results

_Indexed: 2026-04-29 by util-broker_

`all<T, E>(results: Result<T, E>[]): Result<T[], E>` / `any(results): Result<T, E>` / `partition(results): { successes; failures }`
Path: `packages/core/src/types/result.ts`
Purpose: Aggregate combinators for arrays of `Result`.

## from-try

_Indexed: 2026-04-29 by util-broker_

`from_try<T, E>(fn: () => T, error_mapper?): Result<T, E>` / `from_nullable(value, error): Result<T, E>`
Path: `packages/core/src/types/result.ts`
Purpose: Convert thrown exceptions or nullable values into `Result`.

## ice-error-classes

_Indexed: 2026-04-29 by util-broker_

`class IceError extends Error` + subclasses: `ValidationError`, `GraphError`, `NodeNotFoundError`, `CycleDetectedError`, `ProviderError`, `AuthenticationError`, `RateLimitError`, `DeploymentError`, `SecurityError`, `InternalError`, `NotImplementedError`
Path: `packages/core/src/types/errors.ts`
Purpose: Tagged-error hierarchy for the engine — every public function returns one of these via `Result`.

## is-ice-error

_Indexed: 2026-04-29 by util-broker_

`is_ice_error(error: unknown): error is IceError`
Path: `packages/core/src/types/errors.ts`
Purpose: Type guard for engine-tagged errors.

## is-retryable

_Indexed: 2026-04-29 by util-broker_

`is_retryable(error: unknown): boolean`
Path: `packages/core/src/types/errors.ts`
Purpose: True for transient errors (rate-limit, network, retryable provider faults).

## wrap-error

_Indexed: 2026-04-29 by util-broker_

`wrap_error(error: unknown, message?: string): IceError`
Path: `packages/core/src/types/errors.ts`
Purpose: Promotes any thrown value into an `IceError`, preserving the original cause.

## create-node-id

_Indexed: 2026-04-29 by util-broker_

`create_node_id(id: string): NodeId` / `create_edge_id(id): EdgeId` / `create_graph_id(id): GraphId`
Path: `packages/core/src/types/graph.ts`
Purpose: Brand constructors for graph identifier types.

## create-provider-id

_Indexed: 2026-04-29 by util-broker_

`create_provider_id(provider: ProviderId): string`
Path: `packages/core/src/types/providers.ts`
Purpose: Brand constructor for provider IDs.

## create-deployment-id

_Indexed: 2026-04-29 by util-broker_

`create_deployment_id(id: string): DeploymentId`
Path: `packages/core/src/types/deployment.ts`
Purpose: Brand constructor for deployment IDs.

## topological-sort

_Indexed: 2026-04-29 by util-broker_

`topological_sort(graph: MutableGraph): TopologicalSortResult` / `reverse_topological_sort(...)`
Path: `packages/core/src/graph/algorithms.ts`
Purpose: Kahn's-algorithm sort with cycle detection; reverse for teardown order.

## has-cycle

_Indexed: 2026-04-29 by util-broker_

`has_cycle(graph: MutableGraph): boolean` / `find_cycles(graph): NodeId[][]`
Path: `packages/core/src/graph/algorithms.ts`
Purpose: Cycle existence + enumeration over a graph.

## find-paths

_Indexed: 2026-04-29 by util-broker_

`find_all_paths(graph, start, end, max_paths?): NodeId[][]` / `find_shortest_path(graph, start, end): NodeId[] | null`
Path: `packages/core/src/graph/algorithms.ts`
Purpose: Path-finding between two nodes (DFS enumerate / BFS shortest).

## find-connected-components

_Indexed: 2026-04-29 by util-broker_

`find_connected_components(graph): NodeId[][]` / `find_strongly_connected_components(graph): NodeId[][]`
Path: `packages/core/src/graph/algorithms.ts`
Purpose: Connected / strongly-connected component partitioning.

## get-execution-layers

_Indexed: 2026-04-29 by util-broker_

`get_execution_layers(graph): NodeId[][]` / `get_critical_path(graph): NodeId[]`
Path: `packages/core/src/graph/algorithms.ts`
Purpose: Parallel-execution layering and longest-path critical chain for deploy scheduling.

## calculate-graph-metrics

_Indexed: 2026-04-29 by util-broker_

`calculate_metrics(graph: MutableGraph): GraphMetrics`
Path: `packages/core/src/graph/algorithms.ts`
Purpose: Aggregates node/edge counts, depth, breadth, density.

## mutable-graph

_Indexed: 2026-04-29 by util-broker_

`class MutableGraph implements Graph` + `create_mutable_graph(...)`
Path: `packages/core/src/graph/mutable-graph.ts`
Purpose: In-memory mutable graph implementation; the engine's primary graph data type.

## tokenize

_Indexed: 2026-04-29 by util-broker_

`tokenize(source: string, options?: Partial<LexerOptions>): LexerResult` + `class Lexer`
Path: `packages/core/src/graph/parser/lexer.ts`
Purpose: Lexer for the ICE graph DSL.

## parse

_Indexed: 2026-04-29 by util-broker_

`parse(tokens: Token[], options?: Partial<ParserOptions>): ParserResult` + `class Parser`
Path: `packages/core/src/graph/parser/parser.ts`
Purpose: Parser → AST for the ICE graph DSL.

## parse-json

_Indexed: 2026-04-29 by util-broker_

`parse_json(input: string, file?: string): FormatParserResult`
Path: `packages/core/src/graph/parser/format-parser.ts`
Purpose: JSON-format graph parser; produces a `MutableGraph`.

## classify-resource

_Indexed: 2026-04-29 by util-broker_

`classify_resource(resourceType: string): NodeCategory`
Path: `packages/core/src/graph/classifier/category-classifier.ts`
Purpose: Maps a resource type to a NodeCategory (compute/data/network/etc).

## is-category-visible-at-level

_Indexed: 2026-04-29 by util-broker_

`is_category_visible_at_level(category: NodeCategory, level: 1 | 2 | 3): boolean` / `is_resource_visible_at_level(...)`
Path: `packages/core/src/graph/classifier/category-classifier.ts`
Purpose: Level-of-detail visibility per category — drives canvas zoom-tier hiding.

## is-container-type

_Indexed: 2026-04-29 by util-broker_

`is_container_type(resourceType: string): boolean`
Path: `packages/core/src/graph/classifier/category-classifier.ts`
Purpose: True for resource types that act as layout containers (alternate of `@ice/types/isContainer`).

## get-types-by-category

_Indexed: 2026-04-29 by util-broker_

`get_types_by_category(category: NodeCategory): string[]`
Path: `packages/core/src/graph/classifier/category-classifier.ts`
Purpose: Reverse lookup — all resource types in a category.

## relationship-inferrer

_Indexed: 2026-04-29 by util-broker_

`class RelationshipInferrer` + `create_relationship_inferrer(...)` + `infer_relationships(...)`
Path: `packages/core/src/graph/inference/relationship-inferrer.ts`
Purpose: Inspects nodes and proposes implicit `connects_to`/`depends_on` edges.

## graph-validators

_Indexed: 2026-04-29 by util-broker_

Built-in `Validator` classes: `CycleValidator`, `ReferenceValidator`, `NamingValidator`, `ConnectivityValidator`, `TypeValidator`, `PropertyValidator`, `SensitiveDataValidator`, `BestPracticesValidator`
Path: `packages/core/src/graph/validator/validators.ts`
Purpose: Pluggable validators run by `GraphValidator.validate()`.

## create-builtin-validators

_Indexed: 2026-04-29 by util-broker_

`create_builtin_validators(schema_provider?): Validator[]`
Path: `packages/core/src/graph/validator/validators.ts`
Purpose: Default validator stack for typical graph validation.

## graph-validator

_Indexed: 2026-04-29 by util-broker_

`class GraphValidator` + `class ValidationContext` + `create_graph_validator()` + `create_validator(...)`
Path: `packages/core/src/graph/validator/base-validator.ts`
Purpose: Orchestrator that runs `Validator[]` against a graph.

## diff-properties

_Indexed: 2026-04-29 by util-broker_

`diff_properties(desired, current): PropertyChange[]` / `deep_equal(a, b): boolean`
Path: `packages/core/src/plan/diff.ts`
Purpose: Property-level diff between desired vs current resource state.

## is-destructive-change

_Indexed: 2026-04-29 by util-broker_

`is_destructive_change(resource_type: string, changes: PropertyChange[]): boolean`
Path: `packages/core/src/plan/diff.ts`
Purpose: True if a change set requires replace-not-update (e.g. region change).

## summarize-changes

_Indexed: 2026-04-29 by util-broker_

`summarize_changes(changes: PropertyChange[]): string` / `format_property_change(change): string`
Path: `packages/core/src/plan/diff.ts`
Purpose: Human-readable diff summaries for the Plan view.

## diff-graphs

_Indexed: 2026-04-29 by util-broker_

`diff_graphs(desired: Graph, current: Graph, provider: string, options?: DiffOptions): DiffResult`
Path: `packages/core/src/diff/diff.ts`
Purpose: Whole-graph diff (added/removed/changed nodes + edges) for plan generation.

## format-plan

_Indexed: 2026-04-29 by util-broker_

`format_plan(result: DiffResult): string`
Path: `packages/core/src/diff/diff.ts`
Purpose: Renders a plan diff as a human-readable summary.

## create-plan

_Indexed: 2026-04-29 by util-broker_

`create_plan(...): DeploymentPlan`
Path: `packages/core/src/plan/plan-engine.ts`
Purpose: Build a deployment plan from desired/current graphs + provider.

## plan-has-changes

_Indexed: 2026-04-29 by util-broker_

`plan_has_changes(plan): boolean` / `plan_has_destructive_changes(plan): boolean`
Path: `packages/core/src/plan/plan-engine.ts`
Purpose: Quick predicates over a `DeploymentPlan`.

## get-changes-by-action

_Indexed: 2026-04-29 by util-broker_

`get_changes_by_action(plan, action): PlannedChange[]` / `get_plan_execution_layers(plan): PlannedChange[][]`
Path: `packages/core/src/plan/plan-engine.ts`
Purpose: Filter / layer plan changes for parallel deploy.

## serialize-plan

_Indexed: 2026-04-29 by util-broker_

`serialize_plan(plan): string` / `deserialize_plan(json): DeploymentPlan`
Path: `packages/core/src/plan/plan-engine.ts`
Purpose: JSON round-trip for persisted plans.

## apply-succeeded

_Indexed: 2026-04-29 by util-broker_

`apply_succeeded(result: ApplyResult): boolean` / `get_failed_resources(result)` / `get_successful_resources(result)`
Path: `packages/core/src/apply/apply-engine.ts`
Purpose: Predicates and partitioners over an `ApplyResult`.

## compute-derived

_Indexed: 2026-04-29 by util-broker_

`computeDerived(nodes: PropagationNode[], edges: PropagationEdge[]): PatchSet`
Path: `packages/core/src/compute/compute-derived.ts`
Purpose: Reactive property propagation — derives node patches from `PROPAGATION_RULES` + `AGGREGATE_RULES`.

## diff-patches

_Indexed: 2026-04-29 by util-broker_

`diffPatches(currentNodes, currentEdges, patchSet: PatchSet): PatchSet`
Path: `packages/core/src/compute/compute-derived.ts`
Purpose: Filters a desired-patch-set down to only patches that materially change current values.

## validate-canvas

_Indexed: 2026-04-29 by util-broker_

`validateCanvas(nodes, edges, ctx?): CanvasIssue[]` / `validateNode(node, ctx?): CanvasIssue[]`
Path: `packages/core/src/validation/canvas-validator.ts`
Purpose: Top-level canvas validation — runs property/structure/architecture/deploy rules.

## validate-template

_Indexed: 2026-04-29 by util-broker_

`validateTemplate(template: TemplateInput): CanvasIssue[]`
Path: `packages/core/src/validation/template-validator.ts`
Purpose: Validates a template/blueprint definition.

## validate-connections

_Indexed: 2026-04-29 by util-broker_

`validateConnections(...): CanvasIssue[]`
Path: `packages/core/src/validation/connection-rules.ts`
Purpose: Edge validation against `CONNECTION_RULES`.

## validate-properties

_Indexed: 2026-04-29 by util-broker_

`validateProperties(nodes, ctx): CanvasIssue[]`
Path: `packages/core/src/validation/property-rules.ts`
Purpose: Per-node property validation (required fields, enum membership, etc).

## validate-structure

_Indexed: 2026-04-29 by util-broker_

`validateStructure(nodes, edges): CanvasIssue[]`
Path: `packages/core/src/validation/structure-rules.ts`
Purpose: Graph-shape validation (orphans, dangling refs, cycles).

## validate-architecture

_Indexed: 2026-04-29 by util-broker_

`validateArchitecture(...): CanvasIssue[]`
Path: `packages/core/src/validation/architecture-rules.ts`
Purpose: Pattern-level checks (e.g. backend missing DB, public service missing WAF).

## validate-deployability

_Indexed: 2026-04-29 by util-broker_

`validateDeployability(...): CanvasIssue[]`
Path: `packages/core/src/validation/deploy-rules.ts`
Purpose: Pre-deploy invariant checks (creds present, regions consistent).

## get-resource-for-ice-type

_Indexed: 2026-04-29 by util-broker_

`getResourceForIceType(iceType: string): HighLevelResource | undefined` / `getPropertiesForIceType(iceType): HighLevelProperty[]` / `getSupportedProviders(iceType): string[]` / `isKnownIceType(iceType): boolean`
Path: `packages/core/src/validation/schema-bridge.ts`
Purpose: Lookups from the high-level resource catalog used in validators.

## classify-gcp-error

_Indexed: 2026-04-29 by util-broker_

`classifyGCPError(...)` / `classifyAWSError(...)` / `classifyAzureError(...)`
Path: `packages/core/src/errors/import-errors.ts`
Purpose: Tags raw provider import errors into normalized categories.

## sqlite-state-store

_Indexed: 2026-04-29 by util-broker_

`class SqliteStateStore` + `create_sqlite_state_store(options?)` + `create_memory_state_store()`
Path: `packages/core/src/state/sqlite-state-store.ts`
Purpose: Default deploy-state persistence backend (file-backed or in-memory for tests).

## embedded-schema-provider

_Indexed: 2026-04-29 by util-broker_

`class EmbeddedSchemaProvider` + `create_embedded_schema_provider(db_path?)` + `create_embedded_schema_provider_with_registry(...)`
Path: `packages/core/src/schema/embedded-schema-provider.ts`
Purpose: Reads the bundled SQLite schema DB; the engine's default `GraphSchemaProvider`.

## unified-type-resolver

_Indexed: 2026-04-29 by util-broker_

`class UnifiedTypeResolver` + `get_type_resolver()` + `create_type_resolver(schema_provider?)`
Path: `packages/core/src/schema/unified-type-resolver.ts`
Purpose: Resolves raw resource types → unified iceType across providers.

## type-mapper

_Indexed: 2026-04-29 by util-broker_

`class TypeMapper` + `create_type_mapper(schema_provider)`
Path: `packages/core/src/schema/type-mapper.ts`
Purpose: Bidirectional mapping between iceTypes and provider-specific resource types.

## resource-validator

_Indexed: 2026-04-29 by util-broker_

`class ResourceValidator` + `create_resource_validator(schema_provider)`
Path: `packages/core/src/schema/resource-validator.ts`
Purpose: Validates a resource's properties against its schema definition.

## customization-loader

_Indexed: 2026-04-29 by util-broker_

`class CustomizationLoader` + `create_customization_loader(project_root?)` + `get_base_db_path(): string`
Path: `packages/core/src/schema/customization-loader.ts`
Purpose: Loads project-local schema customizations layered on top of the bundled DB.

## create-ice-type

_Indexed: 2026-04-29 by util-broker_

`create_ice_type(type: string): IceType`
Path: `packages/core/src/schema/schema-provider.ts`
Purpose: Brand constructor for `IceType` strings.

## get-cloud-provider

_Indexed: 2026-04-29 by util-broker_

`getCloudProvider(id: string): CloudProviderMeta | undefined` / `getAllCloudProviders(): CloudProviderMeta[]` / `getCloudProviderColor(id)` / `getCloudProviderShortName(id)`
Path: `packages/core/src/resources/cloud-providers.ts`
Purpose: Provider catalog lookup (color, short name, metadata).

## get-block-template

_Indexed: 2026-04-29 by util-broker_

`getBlockTemplate(name: string): BlockTemplate | undefined` / `createBlockFromTemplate(...)`
Path: `packages/core/src/resources/cloud-blocks.ts`
Purpose: Lookup and instantiation of canonical block templates.

## get-block-type-tag

_Indexed: 2026-04-29 by util-broker_

`getBlockTypeTag(type: BlockType): { label: string; color: string }`
Path: `packages/core/src/resources/cloud-blocks.ts`
Purpose: UI tag (label + color) for a block type.

## get-provider-icon

_Indexed: 2026-04-29 by util-broker_

`getProviderIcon(provider: CloudProvider): string`
Path: `packages/core/src/resources/cloud-blocks.ts`
Purpose: Returns the icon-asset path for a provider.

## format-uptime

_Indexed: 2026-04-29 by util-broker_

`formatUptime(deployedAt?: string): string`
Path: `packages/core/src/resources/cloud-blocks.ts`
Purpose: Renders an ISO timestamp as a relative "5m ago / 3h ago" uptime string.

## get-scale-preset

_Indexed: 2026-04-29 by util-broker_

`getScalePreset(resourceId: string, tier: ScaleTier, provider: string): Record<string, unknown>` / `getAllPresetsForResource(resourceId)`
Path: `packages/core/src/resources/scale-presets.ts`
Purpose: Returns provider-specific defaults for a resource at a given scale tier.

## get-all-high-level-resources

_Indexed: 2026-04-29 by util-broker_

`getAllHighLevelResources(): HighLevelResource[]` / `getHighLevelResourcesForPalette()` / `filterResourcesByProvider(provider): HighLevelResource[]`
Path: `packages/core/src/resources/high-level-resources.ts`
Purpose: Lookups against the high-level resource catalog (used by palette + validators).

## get-behavior-label

_Indexed: 2026-04-29 by util-broker_

`getBehaviorLabel(behavior: NodeBehavior): string` / `getBehaviorColor(behavior): string`
Path: `packages/core/src/resources/high-level-resources.ts`
Purpose: UX rendering helpers for `NodeBehavior` enum.

## get-gcp-cloud-asset-types

_Indexed: 2026-04-29 by util-broker_

`getGCPCloudAssetTypes(): string[]` / `cloudAssetToHighLevelType(cloudAssetType: string): string | null`
Path: `packages/core/src/resources/high-level-resources.ts`
Purpose: GCP Cloud Asset Inventory ↔ ICE high-level type translation for the importer.

## create-blueprint-from-resource

_Indexed: 2026-04-29 by util-broker_

`createBlueprintFromResource(resourceId: string, overrides: BlueprintOverrides): GeneratedBlueprint`
Path: `packages/core/src/resources/blueprint-factory.ts`
Purpose: Spins up a deployable blueprint from a resource id + overrides.

## enrich-graph-with-state

_Indexed: 2026-04-29 by util-broker_

`enrich_graph_with_state(graph: Graph, state: Map<string, StoredResourceEntry>): Map<string, string>`
Path: `packages/core/src/deploy/state-bridge.ts`
Purpose: Merges persisted state into a graph; returns a node→provider-id map.

## wrap-on-progress-for-node-progress

_Indexed: 2026-04-29 by util-broker_

`wrap_on_progress_for_node_progress(...)`
Path: `packages/core/src/deploy/scheduler.ts`
Purpose: Adapts a generic `on_progress` callback into the per-node progress event shape.

## create-deploy-state-adapter

_Indexed: 2026-04-29 by util-broker_

`create_deploy_state_adapter(store: SqliteStateStore, graph_id: string): DeployStateStore`
Path: `packages/core/src/deploy/state-store-adapter.ts`
Purpose: Adapts the generic `SqliteStateStore` into the `DeployStateStore` interface scoped to one graph.

## translate-card-to-graph

_Indexed: 2026-04-29 by util-broker_

`translate_card_to_graph(input: CardTranslationInput): CardTranslationResult`
Path: `packages/core/src/deploy/card-translator.ts`
Purpose: Converts a Redux canvas card (`nodes`/`edges`) into an engine-ready `Graph`.

## apply-environment-overrides

_Indexed: 2026-04-29 by util-broker_

`apply_environment_overrides(graph, env): Graph` / `get_environment_label(env: EnvironmentType): string` / `get_cost_multiplier(env): number`
Path: `packages/core/src/deploy/environment-config.ts`
Purpose: Applies env-specific replicas/scale overrides; UX helpers for env type.

## expand-blueprint

_Indexed: 2026-04-29 by util-broker_

`expandBlueprint(blueprint: BlockBlueprint, options: ExpandBlueprintOptions): ExpandedBlueprint`
Path: `packages/blocks/src/expand-blueprint.ts`
Purpose: Materializes a block blueprint (multi-resource composite) into nodes + edges with concrete defaults.

## expand-composed-template

_Indexed: 2026-04-29 by util-broker_

`expandComposedTemplate(...)`
Path: `packages/templates/src/expand-template.ts`
Purpose: Expands a multi-block project template into a fully-wired canvas card.

## parse-cost-range

_Indexed: 2026-04-29 by util-broker_

`parseCostRange(cost: string): number`
Path: `packages/ui/src/features/cost/utils/cost-calculator.ts`
Purpose: Parses a `"$5/mo"` or `"$5–$10/mo"` cost string into a numeric midpoint.

## format-cost

_Indexed: 2026-04-29 by util-broker_

`formatCost(value: number): string` / `formatCostRaw(value: number): string`
Path: `packages/ui/src/features/cost/utils/cost-calculator.ts`
Purpose: Currency formatting for cost panels (with/without `/mo` suffix).

## get-node-cost-info

_Indexed: 2026-04-29 by util-broker_

`getNodeCostInfo(node, resourceMap, scaleTier): NodeCostInfo`
Path: `packages/ui/src/features/cost/utils/cost-calculator.ts`
Purpose: Resolves a node's monthly cost + scaling range from the resource catalog.

## compute-cost-summary

_Indexed: 2026-04-29 by util-broker_

`computeCostSummary(nodes: CardNode[], resourceMap: ResourceMap, scaleTier: ScaleTier): CostSummary`
Path: `packages/ui/src/features/cost/utils/cost-calculator.ts`
Purpose: Aggregates per-category totals + scaling envelope across all canvas nodes.

## estimate-data-transfer-cost

_Indexed: 2026-04-29 by util-broker_

`estimateDataTransferCost(provider: string, trafficTierIndex: number): DataTransferEstimate`
Path: `packages/ui/src/features/cost/utils/provider-pricing.ts`
Purpose: Estimates monthly egress cost for a provider at a given traffic tier.

## compare-provider-costs

_Indexed: 2026-04-29 by util-broker_

`compareProviderCosts(...): ProviderCostComparison[]`
Path: `packages/ui/src/features/cost/utils/provider-pricing.ts`
Purpose: Cross-provider cost comparison for the canvas.

## count-traffic-connections

_Indexed: 2026-04-29 by util-broker_

`countTrafficConnections(nodes: CardNode[], edges: CardEdge[]): Map<string, number>`
Path: `packages/ui/src/features/cost/utils/provider-pricing.ts`
Purpose: Counts traffic-category edges entering each node.

## use-cost-calculation

_Indexed: 2026-04-29 by util-broker_

`useCostCalculation(trafficTierIndex: number): CostCalculationResult`
Path: `packages/ui/src/features/cost/hooks/use-cost-calculation.ts`
Purpose: Loads resource definitions once + re-derives cost summary from the active card.

## generate-ghost-suggestions

_Indexed: 2026-04-29 by util-broker_

`generateGhostSuggestions(droppedNode: CardNode, existingNodes, existingEdges): GhostNode[]`
Path: `packages/ui/src/features/canvas/utils/ghost-suggestions.ts`
Purpose: Returns up to 3 ghost suggestions to render after a palette drop.

## analyze-canvas-patterns

_Indexed: 2026-04-29 by util-broker_

`analyzeCanvasPatterns(nodes, edges): CanvasSuggestion[]`
Path: `packages/ui/src/features/canvas/utils/connection-rules.ts`
Purpose: Heuristic missing-connection hints (e.g. backend without DB) for the canvas overlay.

## use-canvas-utils

_Indexed: 2026-04-29 by util-broker_

`useCanvasUtils(svgRef: RefObject<SVGSVGElement>, viewState: ViewState): { screenToCanvas; canvasToScreen; isPointInElement; distance }`
Path: `packages/ui/src/features/canvas/hooks/use-canvas-utils.ts`
Purpose: Screen↔world coordinate conversion + bounds and distance helpers.

## use-canvas-mouse-events

_Indexed: 2026-04-29 by util-broker_

`useCanvasMouseEvents(props: UseCanvasMouseEventsProps): { ... }`
Path: `packages/ui/src/features/canvas/hooks/use-canvas-mouse-events.ts`
Purpose: Mouse handlers for canvas pan/zoom/drag/resize/select/connect.

## use-canvas-validation

_Indexed: 2026-04-29 by util-broker_

`useCanvasValidation(): void`
Path: `packages/ui/src/features/canvas/hooks/use-canvas-validation.ts`
Purpose: Debounced canvas validation runner that dispatches results into Redux.

## use-computing-flows

_Indexed: 2026-04-29 by util-broker_

`useComputingFlows(): void`
Path: `packages/ui/src/features/canvas/hooks/use-computing-flows.ts`
Purpose: Reactive property propagation (`computeDerived` → diff → dispatch) for the active card.

## use-canvas-interactions

_Indexed: 2026-04-29 by util-broker_

`useCanvasInteractions({ ... }): { ... }`
Path: `packages/ui/src/features/canvas/hooks/use-canvas-interactions.ts`
Purpose: Higher-level canvas interaction state machine (mode: pan/drag/resize/box-select).

## suggest-patterns

_Indexed: 2026-04-29 by util-broker_

`suggestPatterns(nodes: CanvasNode[], _edges: CanvasEdge[]): PatternSuggestion[]`
Path: `packages/ui/src/features/ai/utils/suggest-patterns.ts`
Purpose: Returns 3 contextual architecture suggestions for the AI chat empty state.

## serialize-canvas

_Indexed: 2026-04-29 by util-broker_

`serializeCanvas(state: RootState): SerializedCanvas`
Path: `packages/ui/src/features/ai/utils/serialize-canvas.ts`
Purpose: Compact JSON projection of the active card for AI context (strips pixel-level detail).

## use-ai-command

_Indexed: 2026-04-29 by util-broker_

`useAiCommand(): { sendIntent; isProcessing; ... }`
Path: `packages/ui/src/features/ai/hooks/use-ai-command.ts`
Purpose: Streams AI ops via SSE and applies them to the canvas.

## analyze-pre-deploy

_Indexed: 2026-04-29 by util-broker_

`analyzePreDeploy(nodes: CardNode[], edges: CardEdge[]): PreDeployAnalysis`
Path: `packages/ui/src/features/deploy/utils/predeploy-analysis.ts`
Purpose: Returns the security warnings snapshot rendered between Plan and Apply.

## analyze-security-warnings

_Indexed: 2026-04-29 by util-broker_

`analyzeSecurityWarnings(nodes: CardNode[], edges: CardEdge[]): PreDeployWarning[]`
Path: `packages/ui/src/features/deploy/utils/security-rules.ts`
Purpose: Deterministic security-rule scanner (public DB, no WAF, missing secrets, etc).

## map-wire-status-to-overlay

_Indexed: 2026-04-29 by util-broker_

`mapWireStatusToOverlay(status: DeployNodeStatus): string`
Path: `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts`
Purpose: Translates wire-format deploy status → canvas overlay status string.

## apply-deploy-event

_Indexed: 2026-04-29 by util-broker_

`applyDeployEvent(dispatch, event: DeployEvent, cardId: string): void`
Path: `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts`
Purpose: Routes a typed `DeployEvent` to the right slice reducer + canvas-data overlay.

## use-deploy-subscription

_Indexed: 2026-04-29 by util-broker_

`useDeploySubscription(cardId: string | undefined): void`
Path: `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts`
Purpose: App-level hook that subscribes to deploy socket room and hydrates Redux for the active card.

## use-wizard-state

_Indexed: 2026-04-29 by util-broker_

`useWizardState(): { state; validation; setStep; setProjectName; ... }`
Path: `packages/ui/src/features/wizard/hooks/use-wizard-state.ts`
Purpose: Local state machine for the new-project wizard (step navigation + validation).

## resolve-log-filter

_Indexed: 2026-04-29 by util-broker_

`resolveLogFilter(ctx: SourceContext): ResolvedFilter | null`
Path: `services/deploy/src/services/log-stream/filter-resolver.ts`
Purpose: Resolves a log-source node into a Cloud Logging filter expression.

## gcp-credential-resolver

_Indexed: 2026-04-29 by util-broker_

`gcpCredentialResolver: CredentialResolver`
Path: `services/deploy/src/providers/gcp/credential-resolver.ts`
Purpose: GCP-specific resolver that fetches encrypted creds from DB and returns a usable client.

## aws-credential-resolver

_Indexed: 2026-04-29 by util-broker_

`awsCredentialResolver: CredentialResolver`
Path: `services/deploy/src/providers/aws/credential-resolver.ts`
Purpose: AWS-specific resolver — symmetric to the GCP one.

## acquire-deploy-lock

_Indexed: 2026-04-29 by util-broker_

`acquireDeployLock(...): boolean` / `cancelDeploy(cardId): boolean` / `isDeployInFlight(cardId, op): boolean`
Path: `services/deploy/src/services/deploy-locks.ts`
Purpose: Per-card deploy lock manager — prevents concurrent operations on the same card.

## register-temp-dir

_Indexed: 2026-04-29 by util-broker_

`registerTempDir(dir): void` / `releaseTempDir(dir?): void` / `cleanupAllTempDirs(): void`
Path: `services/deploy/src/services/deploy-locks.ts`
Purpose: Tracks temp build dirs so we can clean them on deploy cancel/exit.

## start-deploy-snapshot

_Indexed: 2026-04-29 by util-broker_

`startDeploySnapshot(cardId, deploymentId?)` / `updateDeploySnapshot(cardId, patch)` / `updateDeploySnapshotNode(...)` / `finishDeploySnapshot(cardId, status)` / `getDeploySnapshot(cardId)` / `clearDeploySnapshot(cardId)`
Path: `services/deploy/src/services/deploy-locks.ts`
Purpose: In-memory deploy progress snapshots — read by the `/canvas/deploy/current` route to hydrate clients mid-deploy.

## set-snapshot-persister

_Indexed: 2026-04-29 by util-broker_

`setSnapshotPersister(fn: SnapshotPersister | null): void`
Path: `services/deploy/src/services/deploy-locks.ts`
Purpose: Injects an optional persistence fn so snapshots survive process restarts.

## next-deploy-seq

_Indexed: 2026-04-29 by util-broker_

`nextDeploySeq(cardId: string): number | null` / `recordDeployEvent(cardId, seq, type, payload)` / `forgetDeploymentSeq(deploymentId)`
Path: `services/deploy/src/services/deploy-event-log.ts`
Purpose: Monotonic deploy event sequence counter + JSONL append-only log per deploy.

## map-status-to-overlay

_Indexed: 2026-04-29 by util-broker_

`mapStatusToOverlay(status: DeployNodeStatus): string`
Path: `services/deploy/src/services/deploy.service.ts`
Purpose: Server-side wire status → overlay string (mirror of UI `mapWireStatusToOverlay`).

## compute-complete-totals

_Indexed: 2026-04-29 by util-broker_

`computeCompleteTotals(resources: any[] | undefined): DeployCompleteEvent['totals']` / `deriveCompleteOutcome(...)`
Path: `services/deploy/src/services/deploy.service.ts`
Purpose: Builds the totals + outcome fields on a `DeployCompleteEvent`.

## request-deploy-cancel

_Indexed: 2026-04-29 by util-broker_

`requestDeployCancel(cardId: string): boolean` / `getCurrentDeploySnapshot(cardId): DeployProgressSnapshot | undefined`
Path: `services/deploy/src/services/deploy.service.ts`
Purpose: Public service-layer entry points for cancel + snapshot read.

## start-cron-jobs

_Indexed: 2026-04-29 by util-broker_

`startCronJobs(): void`
Path: `services/deploy/src/services/cron.service.ts`
Purpose: Boots scheduled jobs (deploy retries, snapshot cleanup, etc).

## get-deploy-queue

_Indexed: 2026-04-29 by util-broker_

`getDeployQueue(): any` / `startDeployWorker(): void`
Path: `services/deploy/src/services/queue.service.ts`
Purpose: BullMQ deploy queue accessor + worker bootstrap.

## get-active-subscriptions

_Indexed: 2026-04-29 by util-broker_

`getActiveSubscriptions(): ReadonlyMap<string, SubscribeArgs>`
Path: `services/deploy/src/services/log-stream.service.ts`
Purpose: Returns the active Cloud Logging subscriptions (used by reconnection / health checks).

## start-requirement-poller

_Indexed: 2026-04-29 by util-broker_

`startRequirementPoller(): void` / `stopRequirementPoller(): void`
Path: `services/deploy/src/services/requirement-poller.service.ts`
Purpose: Boots/stops the post-deploy requirement-verification poller (DNS, SSL, etc).

## cleanup-build

_Indexed: 2026-04-29 by util-broker_

`cleanupBuild(buildDir: string): void`
Path: `services/deploy/src/services/build.service.ts`
Purpose: Removes a build's temp directory after a deploy finishes.

## create-audit-entry

_Indexed: 2026-04-29 by util-broker_

`createAuditEntry(intent: string, canvas: any): AuditEntry` / `finalizeAuditEntry(...)` / `writeAuditEntry(entry: AuditEntry): void`
Path: `services/ai/src/services/ai-audit.service.ts`
Purpose: Records AI-generated canvas operations to a JSONL audit log for replay/analysis.

---

## Cross-package duplicates flagged

### iceType classifier set (HIGH IMPACT)

The classifier suite (`isDatabase`, `isCache`, `isQueue`, `isStorage`, `isBackend`, `isFrontend`, `isGateway`, `isAuth`, `isSecrets`, `isMonitoring`, `isSearch`, `isVectorDb`, `isLLM`, `isRepo`, `isEnvConfig`, `isDomain`, `isContainer`) exists in two places with **deliberately-duplicated** implementations:

- `packages/types/src/connection-rules.ts` — canonical
- `packages/core/src/validation/classifiers.ts` — local copy because `@ice/core` uses `NodeNext` resolution while `@ice/types` uses `bundler`, so re-exports don't cross cleanly (per the file's own header).

Plus a partial third copy in `packages/ui/src/features/deploy/utils/security-rules.ts` (private functions: `isDatabase`, `isStorage`, `isGateway`, `isService`, `isAuth`, `isSecret`, `isMonitoring`, `isVpc`, `isSubnet`, `isPrivateNetwork`, `isVpcLike`).

**Risk**: silent divergence — adding a new iceType to one copy (e.g. a new database engine) doesn't propagate. The header comment claims tests will catch divergence, but only the connection-validation tests do; cost calculator, security rules, and validation rules each fan out their own dependencies.

**Suggested dedup**: pick one canonical home (`@ice/types`), fix the moduleResolution mismatch (or expose via a small `@ice/classifiers` package that both resolutions accept), and drop the copies.

### `validateConnection` (canvas) vs `validateConnections` (engine)

- `packages/ui/src/features/canvas/utils/connection-rules.ts` re-exports `validateConnection` from `@ice/types` (single connection check).
- `packages/core/src/validation/connection-rules.ts` exports `validateConnections` (full canvas pass).

Different signatures, different intent — **not a true duplicate**, but the naming is collision-prone (one is a singular check, one is a plural pass). Worth aliasing one of them on import for clarity.

### `mapStatusToOverlay` vs `mapWireStatusToOverlay`

- `services/deploy/src/services/deploy.service.ts` — `mapStatusToOverlay`
- `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts` — `mapWireStatusToOverlay`

Same function, mirrored across the wire boundary. Canonical home should be `@ice/types/deploy-events.ts` next to `DeployNodeStatus`. Both implementations are tiny and identical in intent; one drift point.

### `isContainer` (canvas containment) vs `is_container_type` (engine)

- `packages/types/src/connection-rules.ts` — `isContainer(iceType, nodeType?)`
- `packages/core/src/graph/classifier/category-classifier.ts` — `is_container_type(resourceType)`

Same predicate, different naming convention (camel vs snake). Both check whether a node acts as a layout container. **High confusion risk** for new contributors.

### `parseCostRange` parity check

`parseCostRange` lives only in `packages/ui/src/features/cost/utils/cost-calculator.ts`, but the engine ingests cost strings independently in `services/deploy/src/services/requirements.service.ts` (untracked here — out of scope for this scan). **Worth re-checking** if a future scan picks up cost parsing on the server side.

### Top 3 most concerning by impact

1. **iceType classifier set** — cross-cut: catalog, palette, validation, security rules, cost. Two-and-a-bit copies; tests catch one of three drift modes.
2. **`mapStatusToOverlay` / `mapWireStatusToOverlay`** — wire-protocol mirror. Two implementations on opposite sides of the socket; if the wire enum ever gains a state, both must change in lockstep.
3. **`isContainer` / `is_container_type`** — naming collision across `@ice/types` and `@ice/core`; same intent, different style. New contributors reach for whichever they grep first.
