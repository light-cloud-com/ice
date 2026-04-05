/**
 * Schema Bridge
 *
 * Bidirectional lookup between iceType (e.g. 'Database.PostgreSQL')
 * and resourceId (e.g. 'postgres-db'), plus property schema access.
 *
 * The canvas uses iceType; HIGH_LEVEL_CATEGORIES uses resourceId.
 * BLOCK_BLUEPRINTS has both — we build the bridge from them.
 */

import {
  HIGH_LEVEL_CATEGORIES,
  type HighLevelResource,
  type HighLevelProperty,
} from '../resources/high-level-resources.js';

import { ICE_TYPE_TO_RESOURCE_ID } from '@ice/constants';

// ─── Build lookup maps on first access ──────────────────────────────────────

let _iceTypeToResource: Map<string, HighLevelResource> | null = null;
let _allResources: HighLevelResource[] | null = null;

function ensureMaps() {
  if (_iceTypeToResource) return;
  _iceTypeToResource = new Map();
  _allResources = [];

  for (const cat of HIGH_LEVEL_CATEGORIES) {
    for (const res of cat.resources) {
      _allResources.push(res);
    }
  }
}

/**
 * Look up the HighLevelResource for a given iceType.
 * Returns undefined for special types (Source.Repository, Config.Environment, Groups).
 */
export function getResourceForIceType(iceType: string): HighLevelResource | undefined {
  ensureMaps();
  const resourceId = ICE_TYPE_TO_RESOURCE_ID[iceType];
  if (!resourceId) return undefined;
  return _allResources!.find(r => r.id === resourceId);
}

/**
 * Get the property schema for a given iceType.
 * Returns the HighLevelProperty[] from the matching resource, or empty array.
 */
export function getPropertiesForIceType(iceType: string): HighLevelProperty[] {
  const resource = getResourceForIceType(iceType);
  return resource?.properties ?? [];
}

/**
 * Get which providers support a given iceType.
 */
export function getSupportedProviders(iceType: string): string[] {
  const resource = getResourceForIceType(iceType);
  return resource?.providers ?? [];
}

/**
 * Check if an iceType is a known resource type (not a group or unknown).
 */
export function isKnownIceType(iceType: string): boolean {
  if (!iceType) return false;
  // Groups and containers are valid but don't have resource schemas
  if (iceType.startsWith('Group.') || iceType === 'Network.VPC' || iceType === 'Network.Subnet') return true;
  // Special types
  if (iceType === 'Source.Repository' || iceType === 'Config.Environment') return true;
  return iceType in ICE_TYPE_TO_RESOURCE_ID;
}
