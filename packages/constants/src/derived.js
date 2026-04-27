/**
 * Derived lookup maps — indexed from TREE at module load.
 * If you need a flat Record<iceType, value>, it's here.
 * The tree in ice-types.ts is the source of truth.
 */
import { TREE } from './ice-types.js';
const resourceIds = {};
const primaryTypes = new Set();
const prefixToCategory = {};
const typeToCategory = {};
const requiredProps = {};
const ports = {};
const envVars = {};
for (const [prefix, def] of Object.entries(TREE)) {
    prefixToCategory[prefix] = def.category;
    for (const [name, res] of Object.entries(def.resources)) {
        const t = `${prefix}.${name}`;
        primaryTypes.add(t);
        resourceIds[t] = res.id;
        typeToCategory[t] = def.category;
        if (res.required)
            requiredProps[t] = [...res.required];
        if (res.port !== undefined)
            ports[t] = res.port;
        if (res.envVar)
            envVars[t] = res.envVar;
        if (res.aliases) {
            for (const alias of res.aliases) {
                const a = `${prefix}.${alias}`;
                resourceIds[a] = res.id;
                typeToCategory[a] = def.category;
                if (res.port !== undefined)
                    ports[a] = res.port;
                if (res.envVar)
                    envVars[a] = res.envVar;
            }
        }
    }
}
export const ICE_TYPE_TO_RESOURCE_ID = resourceIds;
export const VALID_TEMPLATE_ICE_TYPES = primaryTypes;
export const PREFIX_TO_CATEGORY = prefixToCategory;
export const TYPE_TO_CATEGORY = typeToCategory;
export const REQUIRED_PROPS = requiredProps;
export const DEFAULT_PORTS = ports;
export const DEFAULT_ENV_VARS = envVars;
