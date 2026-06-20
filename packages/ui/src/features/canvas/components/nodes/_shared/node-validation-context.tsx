/**
 * Cheap context for "does this node have a validation issue?" (CNV2).
 *
 * Mirrors `orphan-context`: computing per-node validation via Redux at every
 * CardShell render would mean N subscriptions per canvas render. Instead the
 * canvas orchestrator already builds a `nodeValidationMap` (issue → per-node
 * {severity, count}) once per render; it's broadcast here so CardShell can do
 * an O(1) `Map.get()` and render its own validation badge — without threading
 * `validationSeverity`/`validationCount` through every concept-node component.
 *
 * Nodes outside a provider get `undefined` (no badge) — the right behavior for
 * the tree-walker unit tests, which invoke nodes as plain functions.
 */

import { createContext, useContext } from 'react';

export interface NodeValidationInfo {
  severity: 'error' | 'warning' | 'info';
  count: number;
}

const NodeValidationContext = createContext<ReadonlyMap<string, NodeValidationInfo>>(new Map());

export const NodeValidationProvider = NodeValidationContext.Provider;

export function useNodeValidation(nodeId: string): NodeValidationInfo | undefined {
  const ctx = useContext(NodeValidationContext) as unknown;
  // Defensive: the node unit tests mock `useContext` to a bare value (a Set)
  // shared across every context. Only call `.get` when it's actually a Map so
  // those harnesses get `undefined` (no badge) instead of a TypeError.
  if (ctx && typeof (ctx as Map<string, NodeValidationInfo>).get === 'function') {
    return (ctx as Map<string, NodeValidationInfo>).get(nodeId);
  }
  return undefined;
}
