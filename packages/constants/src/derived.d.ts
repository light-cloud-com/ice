/**
 * Derived lookup maps — indexed from TREE at module load.
 * If you need a flat Record<iceType, value>, it's here.
 * The tree in ice-types.ts is the source of truth.
 */
import { type NodeCategory } from './ice-types.js';
export declare const ICE_TYPE_TO_RESOURCE_ID: Record<string, string>;
export declare const VALID_TEMPLATE_ICE_TYPES: ReadonlySet<string>;
export declare const PREFIX_TO_CATEGORY: Record<string, NodeCategory>;
export declare const TYPE_TO_CATEGORY: Record<string, NodeCategory>;
export declare const REQUIRED_PROPS: Record<string, string[]>;
export declare const DEFAULT_PORTS: Record<string, number>;
export declare const DEFAULT_ENV_VARS: Record<string, string>;
