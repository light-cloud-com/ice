/**
 * Scenario YAML schema + loader.
 *
 * A scenario describes a project to build and deploy: blocks, properties,
 * connections, expected GCP resources, and recovery-recipe permissions.
 */
import { z } from 'zod';
declare const blockSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    parent: z.ZodOptional<z.ZodString>;
    properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: string;
    id: string;
    properties: Record<string, unknown>;
    parent?: string | undefined;
}, {
    type: string;
    id: string;
    properties?: Record<string, unknown> | undefined;
    parent?: string | undefined;
}>;
declare const connectionSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
}, {
    from: string;
    to: string;
}>;
declare const expectedResourceSchema: z.ZodObject<{
    kind: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    nameContains: z.ZodOptional<z.ZodString>;
    domain: z.ZodOptional<z.ZodString>;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    kind: string;
    name?: string | undefined;
    params?: Record<string, unknown> | undefined;
    nameContains?: string | undefined;
    domain?: string | undefined;
}, {
    kind: string;
    name?: string | undefined;
    params?: Record<string, unknown> | undefined;
    nameContains?: string | undefined;
    domain?: string | undefined;
}>;
export declare const scenarioSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    baseTemplate: z.ZodString;
    project: z.ZodObject<{
        gcp: z.ZodObject<{
            project: z.ZodString;
            region: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            project: string;
            region: string;
        }, {
            project: string;
            region?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        gcp: {
            project: string;
            region: string;
        };
    }, {
        gcp: {
            project: string;
            region?: string | undefined;
        };
    }>;
    blocks: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        parent: z.ZodOptional<z.ZodString>;
        properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: string;
        properties: Record<string, unknown>;
        parent?: string | undefined;
    }, {
        type: string;
        id: string;
        properties?: Record<string, unknown> | undefined;
        parent?: string | undefined;
    }>, "many">>;
    connections: z.ZodDefault<z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
    }, {
        from: string;
        to: string;
    }>, "many">>;
    expect: z.ZodDefault<z.ZodObject<{
        resources: z.ZodDefault<z.ZodArray<z.ZodObject<{
            kind: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            nameContains: z.ZodOptional<z.ZodString>;
            domain: z.ZodOptional<z.ZodString>;
            params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            kind: string;
            name?: string | undefined;
            params?: Record<string, unknown> | undefined;
            nameContains?: string | undefined;
            domain?: string | undefined;
        }, {
            kind: string;
            name?: string | undefined;
            params?: Record<string, unknown> | undefined;
            nameContains?: string | undefined;
            domain?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        resources: {
            kind: string;
            name?: string | undefined;
            params?: Record<string, unknown> | undefined;
            nameContains?: string | undefined;
            domain?: string | undefined;
        }[];
    }, {
        resources?: {
            kind: string;
            name?: string | undefined;
            params?: Record<string, unknown> | undefined;
            nameContains?: string | undefined;
            domain?: string | undefined;
        }[] | undefined;
    }>>;
    recipes: z.ZodDefault<z.ZodObject<{
        allow: z.ZodDefault<z.ZodArray<z.ZodEnum<[ErrorCategory, ...unknown[]]>, "many">>;
        forbid: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodLiteral<"*">, z.ZodEnum<[ErrorCategory, ...unknown[]]>]>, "many">>;
    }, "strip", z.ZodTypeAny, {
        allow: any[];
        forbid: any[];
    }, {
        allow?: any[] | undefined;
        forbid?: any[] | undefined;
    }>>;
    validation: z.ZodDefault<z.ZodObject<{
        allowWarnings: z.ZodDefault<z.ZodUnion<[z.ZodLiteral<"*">, z.ZodArray<z.ZodString, "many">]>>;
    }, "strip", z.ZodTypeAny, {
        allowWarnings: string[] | "*";
    }, {
        allowWarnings?: string[] | "*" | undefined;
    }>>;
    templateOverrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    cleanup: z.ZodDefault<z.ZodObject<{
        destroyOnSuccess: z.ZodDefault<z.ZodBoolean>;
        destroyOnFailure: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        destroyOnSuccess: boolean;
        destroyOnFailure: boolean;
    }, {
        destroyOnSuccess?: boolean | undefined;
        destroyOnFailure?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    project: {
        gcp: {
            project: string;
            region: string;
        };
    };
    cleanup: {
        destroyOnSuccess: boolean;
        destroyOnFailure: boolean;
    };
    description: string;
    baseTemplate: string;
    validation: {
        allowWarnings: string[] | "*";
    };
    blocks: {
        type: string;
        id: string;
        properties: Record<string, unknown>;
        parent?: string | undefined;
    }[];
    connections: {
        from: string;
        to: string;
    }[];
    expect: {
        resources: {
            kind: string;
            name?: string | undefined;
            params?: Record<string, unknown> | undefined;
            nameContains?: string | undefined;
            domain?: string | undefined;
        }[];
    };
    recipes: {
        allow: any[];
        forbid: any[];
    };
    templateOverrides: Record<string, Record<string, unknown>>;
}, {
    id: string;
    name: string;
    project: {
        gcp: {
            project: string;
            region?: string | undefined;
        };
    };
    baseTemplate: string;
    cleanup?: {
        destroyOnSuccess?: boolean | undefined;
        destroyOnFailure?: boolean | undefined;
    } | undefined;
    description?: string | undefined;
    validation?: {
        allowWarnings?: string[] | "*" | undefined;
    } | undefined;
    blocks?: {
        type: string;
        id: string;
        properties?: Record<string, unknown> | undefined;
        parent?: string | undefined;
    }[] | undefined;
    connections?: {
        from: string;
        to: string;
    }[] | undefined;
    expect?: {
        resources?: {
            kind: string;
            name?: string | undefined;
            params?: Record<string, unknown> | undefined;
            nameContains?: string | undefined;
            domain?: string | undefined;
        }[] | undefined;
    } | undefined;
    recipes?: {
        allow?: any[] | undefined;
        forbid?: any[] | undefined;
    } | undefined;
    templateOverrides?: Record<string, Record<string, unknown>> | undefined;
}>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioBlock = z.infer<typeof blockSchema>;
export type ScenarioConnection = z.infer<typeof connectionSchema>;
export type ExpectedResource = z.infer<typeof expectedResourceSchema>;
export interface LoadResult {
    scenario: Scenario;
    source: string;
    raw: unknown;
}
export declare function loadScenario(path: string): LoadResult;
export {};
