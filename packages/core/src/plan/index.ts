/**
 * Plan Module
 *
 * Deployment planning functionality.
 */

// Export diff utilities
export { diff_properties, deep_equal, is_destructive_change, summarize_changes, format_property_change } from './diff';

// Export plan engine
export {
  create_plan,
  plan_has_changes,
  plan_has_destructive_changes,
  get_changes_by_action,
  get_plan_execution_layers,
  serialize_plan,
  deserialize_plan,
  type CreatePlanOptions,
} from './plan-engine';
