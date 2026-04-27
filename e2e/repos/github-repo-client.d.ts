/**
 * GitHub Repo Client — Creates/deletes test repositories via GitHub REST API
 *
 * Uses raw fetch (matching existing github.service.ts pattern).
 * Auth: ICE_TEST_GITHUB_TOKEN env var (PAT with repo + delete_repo scopes).
 */
/**
 * Check if a repository exists.
 * Returns false for 404 (genuinely missing). Treats 200 as exists.
 * Any other response (403, 401, 5xx) throws — we can't silently treat a
 * permission error as "missing" because that cascades into a bogus create
 * attempt and misleading UI output.
 */
export declare function repoExists(org: string, repo: string): Promise<boolean>;
/**
 * True if the repo has zero commits on its default branch (freshly created,
 * or created-then-push-failed state). Used so ensureTestRepos can repair
 * empty repos on a rerun instead of silently skipping them.
 */
export declare function repoIsEmpty(org: string, repo: string): Promise<boolean>;
/**
 * Create a repository in the organization.
 */
export declare function createRepo(opts: {
    org: string;
    name: string;
    description: string;
    topics?: string[];
}): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Push multiple files to a repo in a single commit via Git Trees API.
 * No git clone needed — everything via REST.
 */
export declare function pushFiles(opts: {
    org: string;
    repo: string;
    files: Array<{
        path: string;
        content: string;
    }>;
    message: string;
    branch?: string;
}): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Delete a repository.
 */
export declare function deleteRepo(org: string, repo: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * List test repos in the org. Uses the plain repo-list endpoint with a name
 * prefix filter rather than the search API — search has a 30–60s indexing
 * delay for freshly created repos AND depends on topics being set, which is
 * a separate permission and a separate failure mode. The list endpoint is
 * immediately consistent and authoritative.
 */
export declare function listTestRepos(org: string, prefix?: string): Promise<string[]>;
