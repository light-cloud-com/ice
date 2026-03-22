/**
 * Apply Module
 *
 * Deployment apply functionality.
 */

// Export types
export type {
  ApplyOptions,
  ApplyResult,
  ApplySummary,
  ApplyError,
  ResourceApplyResult,
  ApplyProgressEvent,
  ApplyStartedEvent,
  LayerStartedEvent,
  ResourceStartedEvent,
  ResourceCompletedEvent,
  LayerCompletedEvent,
  ApplyCompletedEvent,
  ApplyProgressCallback,
  ApplyContext,
  ExecutionLayer,
} from './types.js';

// Export apply engine
export { apply_plan, apply_succeeded, get_failed_resources, get_successful_resources } from './apply-engine.js';
