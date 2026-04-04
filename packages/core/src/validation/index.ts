/**
 * Canvas Validation Engine
 *
 * Unified validation for ICE canvas infrastructure.
 * Pure, synchronous functions — no DB calls, no async.
 */

// Main entry points
export { validateCanvas, validateNode } from './canvas-validator.js';

// Individual rule modules (for selective use)
export { validateProperties } from './property-rules.js';
export { validateConnections } from './connection-rules.js';
export { validateStructure } from './structure-rules.js';
export { validateDeployability } from './deploy-rules.js';
export { validateArchitecture } from './architecture-rules.js';

// Schema bridge utilities
export {
  getResourceForIceType,
  getPropertiesForIceType,
  getSupportedProviders,
  isKnownIceType,
} from './schema-bridge.js';

// Template validation
export { validateTemplate } from './template-validator.js';

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
} from './types.js';
