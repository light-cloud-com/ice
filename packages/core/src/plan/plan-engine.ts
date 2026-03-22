/**
 * Plan Engine
 *
 * Core logic for generating deployment plans by comparing
 * desired state (graph) against current state.
 */

import type { Node, NodeId } from '../types/graph.js';
import type {
  DeploymentPlan,
  PlannedChange,
  PlanSummary,
  PlanOptions,
  DeploymentAction,
  PropertyChange,
  ProviderRequirement,
} from '../types/deployment.js';
import type { ResourceState } from '../types/providers.js';
import { create_deployment_id } from '../types/deployment.js';
import { MutableGraph } from '../graph/mutable-graph.js';
import { get_execution_layers } from '../graph/algorithms.js';
import { diff_properties, is_destructive_change } from './diff.js';

// =============================================================================
// Plan Engine
// =============================================================================

/**
 * Options for creating a deployment plan.
 */
export interface CreatePlanOptions extends PlanOptions {
  /** Graph ID for tracking */
  graph_id?: string;
}

/**
 * Create a deployment plan by comparing desired state against current state.
 */
export function create_plan(
  graph: MutableGraph,
  current_state: Map<string, ResourceState>,
  options: CreatePlanOptions = {},
): DeploymentPlan {
  const plan_id = create_deployment_id(`plan_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`);
  const graph_id = options.graph_id ?? graph.id;
  const now = new Date().toISOString();

  // Get target nodes (all if not specified)
  const target_nodes = options.targets ? new Set(options.targets) : null;

  // Compute changes for each node
  const changes: PlannedChange[] = [];
  const providers_used = new Map<string, number>();

  if (options.destroy) {
    // Destroy plan: delete all resources in current state
    changes.push(...compute_destroy_changes(graph, current_state, target_nodes));
  } else {
    // Normal plan: create/update resources to match desired state
    changes.push(...compute_sync_changes(graph, current_state, target_nodes, providers_used));
  }

  // Order changes by dependencies using execution layers
  const ordered_changes = order_changes_by_dependencies(graph, changes);

  // Build summary
  const summary = compute_summary(ordered_changes);

  // Build provider requirements
  const providers = build_provider_requirements(providers_used);

  return {
    id: plan_id,
    graph_id,
    created_at: now,
    changes: ordered_changes,
    summary,
    providers,
  };
}

// =============================================================================
// Change Computation
// =============================================================================

/**
 * Compute changes to sync desired state with current state.
 */
function compute_sync_changes(
  graph: MutableGraph,
  current_state: Map<string, ResourceState>,
  target_nodes: Set<NodeId> | null,
  providers_used: Map<string, number>,
): PlannedChange[] {
  const changes: PlannedChange[] = [];

  for (const node of graph.nodes.values()) {
    // Skip if not in target list
    if (target_nodes && !target_nodes.has(node.id)) {
      continue;
    }

    // Track provider usage
    const provider = extract_provider(node.type);
    providers_used.set(provider, (providers_used.get(provider) ?? 0) + 1);

    const state = current_state.get(node.id);
    const change = compute_node_change(node, state, graph);
    changes.push(change);
  }

  return changes;
}

/**
 * Compute changes to destroy all resources.
 */
function compute_destroy_changes(
  graph: MutableGraph,
  current_state: Map<string, ResourceState>,
  target_nodes: Set<NodeId> | null,
): PlannedChange[] {
  const changes: PlannedChange[] = [];

  for (const [node_id, state] of current_state) {
    // Skip if not in target list
    if (target_nodes && !target_nodes.has(node_id as NodeId)) {
      continue;
    }

    const node = graph.get_node(node_id as NodeId);
    const depends_on = node ? graph.get_dependents(node.id).map((n) => n.id) : [];

    changes.push({
      node_id: node_id as NodeId,
      action: 'delete',
      current_state: state,
      reason: 'Resource marked for destruction',
      depends_on,
      destructive: true,
    });
  }

  return changes;
}

/**
 * Compute the change required for a single node.
 */
function compute_node_change(node: Node, current_state: ResourceState | undefined, graph: MutableGraph): PlannedChange {
  const depends_on = graph.get_dependencies(node.id).map((n) => n.id);

  // No current state - need to create
  if (!current_state) {
    return {
      node_id: node.id,
      action: 'create',
      reason: 'Resource does not exist',
      depends_on,
      destructive: false,
    };
  }

  // Compare properties
  const desired_props = node.properties as Record<string, unknown>;
  const current_props = current_state.outputs;
  const changed_properties = diff_properties(desired_props, current_props);

  // No changes
  if (changed_properties.length === 0) {
    return {
      node_id: node.id,
      action: 'no_op',
      current_state,
      reason: 'Resource is up to date',
      depends_on,
      destructive: false,
    };
  }

  // Check if changes are destructive (require replacement)
  const destructive = is_destructive_change(node.type, changed_properties);

  if (destructive) {
    return {
      node_id: node.id,
      action: 'replace',
      current_state,
      changed_properties,
      reason: 'Resource requires replacement due to immutable property changes',
      depends_on,
      destructive: true,
    };
  }

  // Standard update
  return {
    node_id: node.id,
    action: 'update',
    current_state,
    changed_properties,
    reason: 'Resource properties changed',
    depends_on,
    destructive: false,
  };
}

// =============================================================================
// Dependency Ordering
// =============================================================================

/**
 * Order changes by their dependencies using execution layers.
 */
function order_changes_by_dependencies(graph: MutableGraph, changes: PlannedChange[]): PlannedChange[] {
  // Build a map of node_id to change
  const change_map = new Map<NodeId, PlannedChange>();
  for (const change of changes) {
    change_map.set(change.node_id, change);
  }

  // Get execution layers from the graph
  const layers = get_execution_layers(graph);

  // Flatten layers into ordered list
  const ordered: PlannedChange[] = [];
  const seen = new Set<NodeId>();

  for (const layer of layers) {
    for (const node_id of layer) {
      if (change_map.has(node_id) && !seen.has(node_id)) {
        ordered.push(change_map.get(node_id)!);
        seen.add(node_id);
      }
    }
  }

  // Add any remaining changes not in the graph
  for (const change of changes) {
    if (!seen.has(change.node_id)) {
      ordered.push(change);
    }
  }

  return ordered;
}

// =============================================================================
// Summary Computation
// =============================================================================

/**
 * Compute summary statistics for a plan.
 */
function compute_summary(changes: PlannedChange[]): PlanSummary {
  const counts = {
    total: changes.length,
    create: 0,
    update: 0,
    replace: 0,
    delete: 0,
    no_op: 0,
    destructive: 0,
  };

  for (const change of changes) {
    switch (change.action) {
      case 'create':
        counts.create++;
        break;
      case 'update':
        counts.update++;
        break;
      case 'replace':
        counts.replace++;
        counts.destructive++;
        break;
      case 'delete':
        counts.delete++;
        counts.destructive++;
        break;
      case 'no_op':
        counts.no_op++;
        break;
    }
  }

  return counts;
}

// =============================================================================
// Provider Requirements
// =============================================================================

/**
 * Extract provider name from resource type.
 */
function extract_provider(resource_type: string): string {
  // Format: "aws.ec2.instance" -> "aws"
  // Format: "aws:ec2/instance:Instance" -> "aws"
  const parts = resource_type.split(/[.:\/]/);
  return (parts[0] ?? 'unknown').toLowerCase();
}

/**
 * Build provider requirement list.
 */
function build_provider_requirements(providers_used: Map<string, number>): ProviderRequirement[] {
  const requirements: ProviderRequirement[] = [];

  for (const [provider, count] of providers_used) {
    requirements.push({
      provider,
      resource_count: count,
    });
  }

  return requirements.sort((a, b) => b.resource_count - a.resource_count);
}

// =============================================================================
// Plan Utilities
// =============================================================================

/**
 * Check if a plan has any changes.
 */
export function plan_has_changes(plan: DeploymentPlan): boolean {
  return plan.summary.create > 0 || plan.summary.update > 0 || plan.summary.replace > 0 || plan.summary.delete > 0;
}

/**
 * Check if a plan has destructive changes.
 */
export function plan_has_destructive_changes(plan: DeploymentPlan): boolean {
  return plan.summary.destructive > 0;
}

/**
 * Get changes of a specific action type.
 */
export function get_changes_by_action(plan: DeploymentPlan, action: DeploymentAction): PlannedChange[] {
  return plan.changes.filter((c) => c.action === action);
}

/**
 * Get the execution layers for a plan.
 */
export function get_plan_execution_layers(plan: DeploymentPlan): PlannedChange[][] {
  const layers: PlannedChange[][] = [];
  const completed = new Set<NodeId>();
  const remaining = [...plan.changes];

  while (remaining.length > 0) {
    const layer: PlannedChange[] = [];
    const layer_indices: number[] = [];

    for (let i = 0; i < remaining.length; i++) {
      const change = remaining[i]!;
      const deps_complete = change.depends_on.every((dep) => completed.has(dep));

      if (deps_complete) {
        layer.push(change);
        layer_indices.push(i);
      }
    }

    if (layer.length === 0 && remaining.length > 0) {
      // Cycle or missing dependency - add all remaining to break deadlock
      layers.push(remaining);
      break;
    }

    // Remove processed items and mark as completed
    for (let i = layer_indices.length - 1; i >= 0; i--) {
      const idx = layer_indices[i]!;
      remaining.splice(idx, 1);
    }

    for (const change of layer) {
      completed.add(change.node_id);
    }

    if (layer.length > 0) {
      layers.push(layer);
    }
  }

  return layers;
}

/**
 * Serialize a plan to JSON for storage.
 */
export function serialize_plan(plan: DeploymentPlan): string {
  return JSON.stringify(plan, null, 2);
}

/**
 * Deserialize a plan from JSON.
 */
export function deserialize_plan(json: string): DeploymentPlan {
  return JSON.parse(json) as DeploymentPlan;
}
