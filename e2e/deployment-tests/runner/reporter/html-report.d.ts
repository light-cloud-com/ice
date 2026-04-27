/**
 * HTML report — renders events.jsonl into a single-file timeline view per
 * run. Output: <runDir>/index.html. Self-contained; no external assets.
 */
export declare function renderRunReport(runDir: string): string;
export declare function renderAllRuns(rootDir: string): string[];
