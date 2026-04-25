/**
 * Test Repo Orchestrator — Creates/cleans up test GitHub repos
 *
 * These repos provide source code for Cloud Run deployments during testing.
 */

import { createRepo, pushFiles, deleteRepo, repoExists, listTestRepos, repoIsEmpty } from './github-repo-client';
import { helloApiFiles } from './templates/hello-api';
import { helloPythonFiles } from './templates/hello-python';
import { helloStaticFiles } from './templates/hello-static';
import { helloDataFiles } from './templates/hello-data';

const ORG = 'light-cloud-com';
const TOPIC = 'ice-test-fixture';

const REPOS = [
  { name: 'ice-test-hello-api', description: 'ICE test: Express.js API', files: helloApiFiles },
  { name: 'ice-test-hello-python', description: 'ICE test: Flask API', files: helloPythonFiles },
  { name: 'ice-test-hello-static', description: 'ICE test: Static site', files: helloStaticFiles },
  { name: 'ice-test-hello-data', description: 'ICE test: Data pipeline', files: helloDataFiles },
] as const;

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
export async function ensureTestRepos(): Promise<TestRepoManifest> {
  const results: TestRepoResult[] = [];

  for (const repo of REPOS) {
    const fullName = `${ORG}/${repo.name}`;
    const exists = await repoExists(ORG, repo.name);

    let justCreated = false;
    if (!exists) {
      const createResult = await createRepo({
        org: ORG,
        name: repo.name,
        description: repo.description,
        topics: [TOPIC],
      });

      if (!createResult.success) {
        console.warn(`Failed to create ${repo.name}: ${createResult.error}`);
        results.push({
          org: ORG,
          name: repo.name,
          fullName,
          status: 'failed',
          created: false,
          error: createResult.error,
        });
        continue;
      }
      justCreated = true;
    }

    // Whether we just created it or it already existed, push files if the
    // repo is empty. This makes ensureTestRepos fully idempotent — a previous
    // half-failed run (repo created, push 403'd or 404'd) heals itself on
    // the next call instead of being permanently stuck as "existed + empty".
    let needsPush = justCreated;
    if (!justCreated) {
      try {
        needsPush = await repoIsEmpty(ORG, repo.name);
      } catch {
        needsPush = false;
      }
    }

    if (!needsPush) {
      results.push({ org: ORG, name: repo.name, fullName, status: 'existed', created: false });
      continue;
    }

    const pushResult = await pushFiles({
      org: ORG,
      repo: repo.name,
      files: repo.files(),
      message: 'Initial commit — ICE test fixture',
    });

    if (!pushResult.success) {
      console.warn(`Failed to push to ${repo.name}: ${pushResult.error}`);
      results.push({
        org: ORG,
        name: repo.name,
        fullName,
        status: 'failed',
        created: justCreated,
        error: justCreated
          ? `Repo created but push failed: ${pushResult.error}`
          : `Push to existing empty repo failed: ${pushResult.error}`,
      });
      continue;
    }

    results.push({
      org: ORG,
      name: repo.name,
      fullName,
      status: justCreated ? 'created' : 'existed',
      created: justCreated,
    });
  }

  return {
    repos: results,
    success: results.every((r) => r.status !== 'failed'),
  };
}

export interface TestRepoCleanupResult {
  deleted: string[];
  failed: Array<{ name: string; error: string }>;
  discovered: number;
  success: boolean;
}

/**
 * Delete all test repos in the org. Uses a name-prefix scan (see listTestRepos)
 * so freshly created repos are found immediately instead of waiting on the
 * GitHub search index.
 */
export async function cleanupTestRepos(): Promise<TestRepoCleanupResult> {
  const repos = await listTestRepos(ORG);
  const deleted: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const name of repos) {
    const result = await deleteRepo(ORG, name);
    if (result.success) {
      console.log(`Deleted test repo: ${ORG}/${name}`);
      deleted.push(name);
    } else {
      console.warn(`Failed to delete ${ORG}/${name}: ${result.error}`);
      failed.push({ name, error: result.error || 'unknown' });
    }
  }

  return {
    deleted,
    failed,
    discovered: repos.length,
    success: failed.length === 0,
  };
}
