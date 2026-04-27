/**
 * Properties-panel UI helpers.
 *
 * Drives the right-hand properties panel via the data-prop-key attributes
 * we added to TextField/NumberField/SelectField wrappers and to the
 * generic PropertyFields renderer. Falls back to label-text matching for
 * fields that don't yet expose data-prop-key.
 */
import type { Page } from '@playwright/test';
import type { RunLogger } from '../logger/run-logger';
export interface SetPropertyOpts {
    routeId?: string;
    exact?: boolean;
}
export declare class PropertiesUI {
    private page;
    private logger;
    constructor(page: Page, logger: RunLogger);
    /**
     * Find the input element bound to a property key. Tries:
     *   1. [data-prop-key="<key>"][data-route-id="<routeId>"] (when routeId given)
     *   2. [data-prop-key="<key>"] (input or select)
     *   3. label-text near an input (case-insensitive contains)
     */
    findInput(key: string, opts?: SetPropertyOpts): Promise<import("@playwright/test").Locator>;
    setText(key: string, value: string, opts?: SetPropertyOpts): Promise<void>;
    setSelect(key: string, value: string, opts?: SetPropertyOpts): Promise<void>;
    /**
     * Apply a flat map of property values. Strings → setText; arrays/objects
     * are skipped (callers handle complex shapes per-block).
     */
    applyProperties(props: Record<string, unknown>, opts?: SetPropertyOpts): Promise<void>;
}
