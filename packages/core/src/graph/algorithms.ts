/**
 * Graph Algorithms
 *
 * Graph algorithms for dependency analysis and deployment ordering.
 *
 * The original 586-LOC monolith has been decomposed into four
 * sub-modules under `./algorithms/`. This file is now a thin
 * re-export shim that preserves the public API exactly.
 *
 * Decomposition map:
 *  - `./algorithms/topo-cycle.ts` — topological_sort,
 *    reverse_topological_sort, has_cycle, find_cycles (rf-galg-1).
 *    Grouped together because topological_sort uses a private
 *    cycle helper for error reporting.
 *  - `./algorithms/paths.ts` — find_all_paths, find_shortest_path
 *    (rf-galg-2). Independent BFS/DFS path finding.
 *  - `./algorithms/components.ts` — find_connected_components,
 *    find_strongly_connected_components (rf-galg-3). Connected
 *    components (undirected) + Tarjan's SCCs (directed).
 *  - `./algorithms/analysis.ts` — get_execution_layers,
 *    get_critical_path, calculate_metrics, GraphMetrics interface
 *    (rf-galg-4). Dependency analysis built on the other modules.
 *
 * Public API unchanged — all eleven exported functions and the
 * GraphMetrics type keep their pre-extraction shapes. External
 * consumers (graph/index.ts, plan/plan-engine.ts,
 * graph/validator/validators.ts) continue importing through this
 * shim.
 */

export { find_cycles, has_cycle, reverse_topological_sort, topological_sort } from './algorithms/topo-cycle';

export { find_all_paths, find_shortest_path } from './algorithms/paths';

export { find_connected_components, find_strongly_connected_components } from './algorithms/components';

export type { GraphMetrics } from './algorithms/analysis';

export { calculate_metrics, get_critical_path, get_execution_layers } from './algorithms/analysis';
