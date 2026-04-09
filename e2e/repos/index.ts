/**
 * Test Repo Orchestrator — Creates/cleans up test GitHub repos
 *
 * These repos provide source code for Cloud Run deployments during testing.
 */

import { createRepo, pushFiles, deleteRepo, repoExists, listTestRepos } from './github-repo-client';
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

export interface TestRepoManifest {
  repos: Array<{ org: string; name: string; fullName: string; created: boolean }>;
}

/**
 * Ensure all test repos exist with correct content. Idempotent.
 */
export async function ensureTestRepos(): Promise<TestRepoManifest> {
  const results: TestRepoManifest['repos'] = [];

  for (const repo of REPOS) {
    const exists = await repoExists(ORG, repo.name);

    if (!exists) {
      const createResult = await createRepo({
        org: ORG,
        name: repo.name,
        description: repo.description,
        topics: [TOPIC],
      });

      if (!createResult.success) {
        console.warn(`Failed to create ${repo.name}: ${createResult.error}`);
        results.push({ org: ORG, name: repo.name, fullName: `${ORG}/${repo.name}`, created: false });
        continue;
      }

      // Push files
      const pushResult = await pushFiles({
        org: ORG,
        repo: repo.name,
        files: repo.files(),
        message: 'Initial commit — ICE test fixture',
      });

      if (!pushResult.success) {
        console.warn(`Failed to push to ${repo.name}: ${pushResult.error}`);
      }

      results.push({ org: ORG, name: repo.name, fullName: `${ORG}/${repo.name}`, created: true });
    } else {
      results.push({ org: ORG, name: repo.name, fullName: `${ORG}/${repo.name}`, created: false });
    }
  }

  return { repos: results };
}

/**
 * Delete all test repos in the org (identified by topic).
 */
export async function cleanupTestRepos(): Promise<void> {
  const repos = await listTestRepos(ORG);

  for (const name of repos) {
    const result = await deleteRepo(ORG, name);
    if (result.success) {
      console.log(`Deleted test repo: ${ORG}/${name}`);
    } else {
      console.warn(`Failed to delete ${ORG}/${name}: ${result.error}`);
    }
  }
}
