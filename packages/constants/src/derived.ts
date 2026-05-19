/**
 * Derived lookup maps — indexed from TREE at module load.
 * If you need a flat Record<iceType, value>, it's here.
 * The tree in ice-types.ts is the source of truth.
 */

import { TREE, type NodeCategory, type ResourceEntry } from './ice-types';

const resourceIds: Record<string, string> = {};
const primaryTypes = new Set<string>();
const prefixToCategory: Record<string, NodeCategory> = {};
const typeToCategory: Record<string, NodeCategory> = {};
const requiredProps: Record<string, string[]> = {};
const ports: Record<string, number> = {};
const envVars: Record<string, string> = {};

for (const [prefix, def] of Object.entries(TREE)) {
  prefixToCategory[prefix] = def.category;
  for (const [name, res] of Object.entries(def.resources as Record<string, ResourceEntry>)) {
    const t = `${prefix}.${name}`;
    primaryTypes.add(t);
    resourceIds[t] = res.id;
    typeToCategory[t] = def.category;
    if (res.required) requiredProps[t] = [...res.required];
    if (res.port !== undefined) ports[t] = res.port;
    if (res.envVar) envVars[t] = res.envVar;
    if (res.aliases) {
      for (const alias of res.aliases) {
        const a = `${prefix}.${alias}`;
        resourceIds[a] = res.id;
        typeToCategory[a] = def.category;
        if (res.port !== undefined) ports[a] = res.port;
        if (res.envVar) envVars[a] = res.envVar;
      }
    }
  }
}

export const ICE_TYPE_TO_RESOURCE_ID: Record<string, string> = resourceIds;
export const VALID_TEMPLATE_ICE_TYPES: ReadonlySet<string> = primaryTypes;
export const PREFIX_TO_CATEGORY: Record<string, NodeCategory> = prefixToCategory;
export const TYPE_TO_CATEGORY: Record<string, NodeCategory> = typeToCategory;
export const REQUIRED_PROPS: Record<string, string[]> = requiredProps;
export const DEFAULT_PORTS: Record<string, number> = ports;
export const DEFAULT_ENV_VARS: Record<string, string> = envVars;
