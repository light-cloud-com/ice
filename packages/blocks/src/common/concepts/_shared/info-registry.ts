/**
 * Concepts Palette — info (i) registry
 *
 * Maps iceType → info content (overview, compilesTo, snippets, links).
 * The concept info modal reads from here by iceType when the user clicks
 * the (i) button on a block.
 */

import type { InfoContent } from './types';

const INFO_REGISTRY = new Map<string, InfoContent>();

export function registerInfo(iceType: string, content: InfoContent): void {
  INFO_REGISTRY.set(iceType, content);
}

export function getInfoContent(iceType: string): InfoContent | undefined {
  return INFO_REGISTRY.get(iceType);
}

export function hasConceptInfo(iceType: string): boolean {
  return INFO_REGISTRY.has(iceType);
}

/** Reset the registry (test-only). */
export function _resetInfoRegistry(): void {
  INFO_REGISTRY.clear();
}

/** Enumerate all registered iceTypes (for build-time validation). */
export function getAllRegisteredInfoIceTypes(): string[] {
  return Array.from(INFO_REGISTRY.keys());
}
