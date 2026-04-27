/**
 * Scenario YAML schema + loader.
 *
 * A scenario describes a project to build and deploy: blocks, properties,
 * connections, expected GCP resources, and recovery-recipe permissions.
 */
import { readFileSync } from 'fs';
import { load as parseYaml } from 'js-yaml';
import { z } from 'zod';
const errorCategoryEnum = [
    'auth',
    'permission',
    'quota',
    'api_not_enabled',
    'config',
    'build',
    'network',
    'timeout',
    'conflict',
    'not_found',
    'unknown',
];
const recipesSchema = z
    .object({
    allow: z.array(z.enum(errorCategoryEnum)).default([]),
    forbid: z.array(z.union([z.literal('*'), z.enum(errorCategoryEnum)])).default(['*']),
})
    .default({ allow: [], forbid: ['*'] });
const validationSchema = z
    .object({
    // Codes to suppress when promoting warnings to design-phase failures.
    // '*' disables the warning gate entirely; default [] = block on every
    // warning (Playwright takes care of all of them).
    allowWarnings: z.union([z.literal('*'), z.array(z.string())]).default([]),
})
    .default({ allowWarnings: [] });
const blockSchema = z.object({
    id: z.string().min(1, 'block.id required'),
    type: z.string().min(1, 'block.type required (iceType, e.g. "Compute.StaticSite")'),
    parent: z.string().optional(), // for container parents (Network.PrivateNetwork)
    properties: z.record(z.string(), z.unknown()).default({}),
});
const connectionSchema = z.object({
    from: z.string().min(1),
    to: z.string().min(1),
});
const expectedResourceSchema = z.object({
    kind: z.string().min(1), // e.g. gcp.storage.bucket — matches gcp-verify.ts dispatch
    name: z.string().optional(),
    nameContains: z.string().optional(),
    domain: z.string().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
});
const cleanupSchema = z
    .object({
    destroyOnSuccess: z.boolean().default(true),
    destroyOnFailure: z.boolean().default(false),
})
    .default({ destroyOnSuccess: true, destroyOnFailure: false });
const projectSchema = z.object({
    gcp: z.object({
        project: z.string().min(1),
        region: z.string().default('us-central1'),
    }),
});
export const scenarioSchema = z.object({
    id: z
        .string()
        .min(1)
        .regex(/^[a-z0-9][a-z0-9-]*$/i, 'id must be kebab-case'),
    name: z.string().min(1),
    description: z.string().default(''),
    baseTemplate: z.string().min(1, 'baseTemplate required (template name from /templates page)'),
    project: projectSchema,
    blocks: z.array(blockSchema).default([]),
    connections: z.array(connectionSchema).default([]),
    expect: z
        .object({
        resources: z.array(expectedResourceSchema).default([]),
    })
        .default({ resources: [] }),
    recipes: recipesSchema,
    validation: validationSchema,
    // Per-iceType property overrides applied to nodes loaded by the
    // baseTemplate. Used to populate user-supplied fields like
    // Source.Repository.repository that templates intentionally leave empty.
    templateOverrides: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
    cleanup: cleanupSchema,
});
// ─── Loader with env-var interpolation ─────────────────────────────────────
const ENV_VAR_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
function interpolate(value, scenarioId) {
    if (typeof value === 'string') {
        return value.replace(ENV_VAR_RE, (full, name) => {
            if (name === 'SCENARIO_ID' && scenarioId)
                return scenarioId;
            const v = process.env[name];
            if (v == null) {
                throw new Error(`Scenario references undefined env var: ${full}`);
            }
            return v;
        });
    }
    if (Array.isArray(value))
        return value.map((v) => interpolate(v, scenarioId));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = interpolate(v, scenarioId);
        }
        return out;
    }
    return value;
}
export function loadScenario(path) {
    const source = readFileSync(path, 'utf-8');
    const raw = parseYaml(source);
    if (!raw || typeof raw !== 'object') {
        throw new Error(`Invalid scenario YAML at ${path}: empty or not an object`);
    }
    const scenarioId = raw.id;
    const interpolated = interpolate(raw, scenarioId);
    const parsed = scenarioSchema.safeParse(interpolated);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
        throw new Error(`Scenario ${path} failed validation:\n${issues}`);
    }
    validateConnections(parsed.data);
    return { scenario: parsed.data, source, raw };
}
function validateConnections(s) {
    const blockIds = new Set(s.blocks.map((b) => b.id));
    for (const c of s.connections) {
        if (!blockIds.has(c.from))
            throw new Error(`connection.from "${c.from}" doesn't match any block.id`);
        if (!blockIds.has(c.to))
            throw new Error(`connection.to "${c.to}" doesn't match any block.id`);
    }
    for (const b of s.blocks) {
        if (b.parent && !blockIds.has(b.parent)) {
            throw new Error(`block "${b.id}" parent "${b.parent}" doesn't match any block.id`);
        }
    }
}
