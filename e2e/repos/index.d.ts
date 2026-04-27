/**
 * Test Repo Orchestrator — Creates/cleans up test GitHub repos
 *
 * These repos provide source code for Cloud Run deployments during testing.
 */
export type TestRepoStatus = 'created' | 'existed' | 'failed';
export interface TestRepoResult {
    org: string;
    name: string;
    fullName: string;
    status: TestRepoStatus;
    /** Kept for back-compat with older UI callers. */
    created: boolean;
    error?: string;
}
export interface TestRepoManifest {
    repos: TestRepoResult[];
    /** Aggregate success — true only if every repo ended in created|existed. */
    success: boolean;
}
/**
 * Ensure all test repos exist with correct content. Idempotent.
 */
export declare function ensureTestRepos(): Promise<TestRepoManifest>;
export interface TestRepoCleanupResult {
    deleted: string[];
    failed: Array<{
        name: string;
        error: string;
    }>;
    discovered: number;
    success: boolean;
}
/**
 * Delete all test repos in the org. Uses a name-prefix scan (see listTestRepos)
 * so freshly created repos are found immediately instead of waiting on the
 * GitHub search index.
 */
export declare function cleanupTestRepos(): Promise<TestRepoCleanupResult>;
