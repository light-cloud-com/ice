/**
 * Connection Constants
 *
 * Connection edge categories, colors, and relationship mapping.
 * Port/envVar data lives on the resource tree in ice-types.ts.
 */
export type ConnectionCategory = 'traffic' | 'pipeline' | 'config' | 'dns';
export declare const CATEGORY_COLORS: Record<ConnectionCategory, string>;
export declare const CATEGORY_TO_RELATIONSHIP: Record<ConnectionCategory, string>;
