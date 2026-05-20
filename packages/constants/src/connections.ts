/**
 * Connection Constants
 *
 * Connection edge categories, colors, and relationship mapping.
 * Port/envVar data lives on the resource tree in ice-types.ts.
 */

export type ConnectionCategory = 'traffic' | 'pipeline' | 'config' | 'dns';

export const CATEGORY_COLORS: Record<ConnectionCategory, string> = {
  traffic: '#22c55e',
  pipeline: '#8b5cf6',
  config: '#f59e0b',
  dns: '#22d3ee',
};

export const CATEGORY_TO_RELATIONSHIP: Record<ConnectionCategory, string> = {
  traffic: 'connects_to',
  pipeline: 'connects_to',
  config: 'depends_on',
  dns: 'connects_to',
};
