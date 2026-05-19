/**
 * Canvas Validation Engine
 *
 * Unified validation for ICE canvas infrastructure.
 * Pure, synchronous functions — no DB calls, no async.
 */

// Main entry points
export { validateCanvas, validateNode } from './canvas-validator';

// Individual rule modules (for selective use)
export { validateProperties } from './property-rules';
export { validateConnections } from './connection-rules';
export { validateStructure } from './structure-rules';
export { validateDeployability } from './deploy-rules';
export { validateArchitecture } from './architecture-rules';

// Schema bridge utilities
export { getResourceForIceType, getPropertiesForIceType, getSupportedProviders, isKnownIceType } from './schema-bridge';

// Template validation
export { validateTemplate } from './template-validator';

// Types
export type {
  CanvasIssue,
  CanvasValidationResult,
  ValidatableNode,
  ValidatableEdge,
  ValidationContext,
  IssueSeverity,
  IssueCategory,
  IssueCode,
} from './types';
