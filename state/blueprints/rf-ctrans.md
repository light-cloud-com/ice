# Blueprint — `packages/core/src/deploy/card-translator.ts`

**Source**: 1585 LOC. **Decomposer run**: 2026-04-30.
**Public API**: `translate_card_to_graph` (function) + 7 exported types. Re-exported through `packages/core/src/deploy/index.ts` L39–48. Runtime callers: `services/deploy/src/services/deploy.service.ts` L75 (`planDeployment`) and L291 (`applyDeployment`).

## Modules (13 units)

### Layer 0 — string/name utils

- **rf-ctrans-1** `utils/name-utils.ts` (~70 LOC, L1518–1585) — `sanitize_name`, `sanitize_label_value`, `parse_storage_gb`, `normalize_runtime`. Pure string transformers; no intra-package imports. Deepest leaves.

- **rf-ctrans-2** `utils/stable-name.ts` (~35 LOC, L765–795) — `ENV_SHORT` const, `generate_stable_name(resource_type, node_id, project_name, environment)`. Depends on `sanitize_name` (rf-ctrans-1) and Node's `createHash`. **RISK #1**.

### Layer 1 — provider type maps + edge helpers

- **rf-ctrans-3** `type-maps.ts` (~135 LOC, L98–223 + L1489–1500 + L313) — `GCP_TYPE_MAP`, `AWS_TYPE_MAP`, `AZURE_TYPE_MAP`, `get_type_map(provider)`, `DESIGN_ONLY_PROVIDERS`. The `get_type_map` helper at L1489 is a pure dispatcher over these three maps and belongs here. No runtime deps.

- **rf-ctrans-4** `edge-classifier.ts` (~60 LOC, L225–313 excl. `DESIGN_ONLY_PROVIDERS` + L1502–1517) — `UI_ONLY_TYPES`, `EXTERNAL_TYPES`, `SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS`, `hasPrivateNetworkAncestor`, `isCustomDomainStandalone`, `map_edge_relationship`. Bundles all "is this node/edge deployable?" predicates. `map_edge_relationship` moves here from L1502–1517. **RISK #2**.

### Layer 1 — property extractors

- **rf-ctrans-5** `extractors/compute.ts` (~90 LOC, L319–404) — `extract_cloud_run_properties`, `extract_cloud_run_job_properties`, `extract_cloud_functions_properties`, `extract_cloud_scheduler_properties`. Uses `normalize_runtime` from rf-ctrans-1.

- **rf-ctrans-6** `extractors/database.ts` (~100 LOC, L351–372 + L433–480) — `extract_cloud_sql_properties` (uses `parse_storage_gb`), `extract_firestore_properties`, `REDIS_SIZE_MAP`, `REDIS_VALID_TIERS`, `extract_memorystore_properties`. **RISK #3**.

- **rf-ctrans-7** `extractors/network.ts` (~115 LOC, L406–424 + L504–600) — `extract_storage_bucket_properties`, `extract_pubsub_properties`, `extract_api_gateway_properties`, `extract_load_balancer_properties`, `extract_vpc_properties`, `extract_subnet_properties`, `extract_cloud_armor_properties`. This module imports `createHash` from `'crypto'` for the CIDR auto-allocation in `extract_subnet_properties`. **RISK #4**.

- **rf-ctrans-8** `extractors/ancillary.ts` (~115 LOC, L482–494 + L526–531 + L602–693) — `extract_secret_manager_properties`, `extract_identity_platform_properties`, `extract_bigquery_properties`, `extract_logging_properties`, `extract_vertex_ai_properties`, `extract_dataflow_properties`, `extract_discovery_engine_properties`, `extract_gke_properties`, `extract_domain_mapping_properties`, `extract_custom_domain_properties`, `extract_backend_bucket_properties`, `extract_firebase_hosting_properties`. No shared deps between these functions.

- **rf-ctrans-9** `extractors/dispatch.ts` (~45 LOC, L699–731) — `PROPERTY_EXTRACTORS` dispatch table. Imports all extractor functions from rf-ctrans-5 through rf-ctrans-8. The orchestrator imports only this module, not the four extractor modules individually.

### Layer 2 — translator pass helpers

- **rf-ctrans-10** `passes/pass-1-4-repo-wiring.ts` (~65 LOC, L1029–1086) — `wire_source_repositories(edges, nodes, card_id_to_name, graph): void`. Extracts Pass 1.4. Mutates graph node properties in-place. **RISK #5**.

- **rf-ctrans-11** `passes/pass-1-45-domain-propagation.ts` (~70 LOC, L1088–1151) — `propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph): void`. Extracts Pass 1.45. Same mutation contract as rf-ctrans-10. **RISK #6**.

- **rf-ctrans-12** `passes/pass-1-5-endpoint-wiring.ts` (~310 LOC, L1153–1457) — `wire_public_endpoints({ edges, nodes, card_id_to_name, graph, deployables, warnings, projectName }): { deployable_count_delta: number }`. Extracts Pass 1.5. Contains the `BackendEntry` local type (promoted to module-level), the `SERVICE_BACKEND_ICE_TYPES` inner Set (stays local), synthetic SSL cert injection, forwarding-rule removal, and host-rules patching. `staticSiteToForwardingRule` map is local to this module. **RISK #7, #8** — highest-risk unit.

### Final

- **rf-ctrans-13** orchestrator slim-down to ~300 LOC. `card-translator.ts` retains: all 8 exported type definitions (L1–96), `translate_card_to_graph` reduced to: Pass 1 node loop (skip checks → type lookup → extractor dispatch → private-network ingress override → stable-name + label merge → `graph.add_node` + collision retry), calls to `wire_source_repositories`, `propagate_custom_domain_hosts`, `wire_public_endpoints`, Pass 2 edge loop, and the return statement. No re-export shims needed — `index.ts` continues to re-export by name from `./card-translator.js`.

## Behavior-risk flags (9 total)

1. **generate_stable_name hash seed**: Seed string `"${project_name}::${environment}::${node_id}"` at L781 (double-colon delimiters, exact field order) is the identity anchor for all deployed resources. Any change triggers destroy-recreate on every existing deployment. Preserve verbatim including delimiters.

2. **map_edge_relationship default branch**: Returns `'connects_to'` for unknown/undefined relationship strings (L1516). This is not a throw; it is the resolved value for every unannotated edge. Preserve the `default: return 'connects_to'` branch verbatim.

3. **REDIS_SIZE_MAP tier strings + REDIS_VALID_TIERS guard**: `'BASIC'` and `'STANDARD_HA'` at L449-455 are passed directly to the Memorystore API. `REDIS_VALID_TIERS` guards the `literalTier` fallback path and must stay co-located. These constants replaced a class of 400 errors from sentinel labels like `'small'`; the guard ensures those sentinels are still dropped.

4. **extract_subnet_properties hash-CIDR allocation**: `createHash('sha256').update(node_id)` at L572, x-octet clamping `(hash[0] % 127) + 1`, y-octet `hash[1]`. Any arithmetic change shifts auto-allocated subnets on existing deployments, requiring recreation. Preserve the hash read and modulus arithmetic verbatim.

5. **Pass 1.4 unconditional overwrite semantics**: The condition at L1081 is `if (value !== undefined && value !== '')` — unconditional overwrite, not "only if target is empty". This was an intentional fix (L1075-1078 comment). Any refactor that changes to `if (!targetProps[to])` reverts the fix.

6. **Pass 1.45 subdomain resolution priority order**: routeId lookup → edge.data.subdomain → blank. The `if (routeId)` branch at L1139 must remain the primary path; the `else` branch is legacy back-compat. Swapping breaks existing edges created before routes existed.

7. **Pass 1.5 triple-mutation on forwarding-rule removal**: `graph.remove_node` + `deployables.splice(idx, 1)` + `deployable_count--` at L1376-1385 must all execute together on the same code path. Partial removal causes the service to upsert a resource mapping for a node that was never deployed.

8. **Pass 1.5 BackendEntry.sourceServiceName post-push mutation**: `be.sourceServiceName = be.targetResourceName` at L1343 mutates an already-pushed entry. The read site (outer loop, L1397) sees the mutated value. If refactored into an immutable builder, verify the read site observes the complete entry.

9. **sanitize_label_value empty-string fallback**: The `cleaned || 'unknown'` guard at L1545 covers inputs that sanitize to an empty string (e.g. `"---"`). The fallback value `'unknown'` appears in every deployed resource's GCP labels. Changing it to any other string shifts labels on all future resources, breaking `--filter="labels.ice-source-id=unknown"` queries on pre-existing resources.

## Public API

Exported from `packages/core/src/deploy/card-translator.ts` and re-exported verbatim in `packages/core/src/deploy/index.ts` L39–48:

| Export                    | Kind     | External consumers                                                                                                                                  |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `translate_card_to_graph` | function | `deploy.service.ts` L75, L291                                                                                                                       |
| `CardTranslationInput`    | type     | `deploy.service.ts` (call-site shape)                                                                                                               |
| `CardTranslationResult`   | type     | `deploy.service.ts` L102, L311                                                                                                                      |
| `CardNodeInput`           | type     | `deploy.service.ts` (implicit via input mapping)                                                                                                    |
| `CardEdgeInput`           | type     | `deploy.service.ts` (implicit via input mapping)                                                                                                    |
| `DeployProvider`          | type     | `deploy.service.ts` options                                                                                                                         |
| `SkippedNode`             | type     | `deploy.service.ts` L329                                                                                                                            |
| `DeployableNodeInfo`      | type     | `deploy.service.ts` L488 (via `translation.deployables`) — **not in current `index.ts` re-export list**; add it if any consumer imports it directly |

No re-export shims are needed. The orchestrator file continues to own all 8 exports; the extracted helper modules are internal to `packages/core/src/deploy/`.
