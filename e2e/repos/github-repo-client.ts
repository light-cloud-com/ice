/**
 * GitHub Repo Client — Creates/deletes test repositories via GitHub REST API
 *
 * Uses raw fetch (matching existing github.service.ts pattern).
 * Auth: ICE_TEST_GITHUB_TOKEN env var (PAT with repo + delete_repo scopes).
 */

const GITHUB_API = 'https://api.github.com';
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

function getToken(): string {
  const token = process.env.ICE_TEST_GITHUB_TOKEN;
  if (!token) throw new Error('ICE_TEST_GITHUB_TOKEN env var required for test repo operations');
  return token;
}

function headers(): Record<string, string> {
  return {
    ...GITHUB_HEADERS,
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Check if a repository exists.
 */
export async function repoExists(org: string, repo: string): Promise<boolean> {
  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}`, { headers: headers() });
  return res.status === 200;
}

/**
 * Create a repository in the organization.
 */
export async function createRepo(opts: {
  org: string;
  name: string;
  description: string;
  topics?: string[];
}): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${GITHUB_API}/orgs/${opts.org}/repos`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: opts.name,
      description: opts.description,
      private: false,
      auto_init: true,
      has_issues: false,
      has_projects: false,
      has_wiki: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 422 && body.includes('already exists')) {
      return { success: true }; // Idempotent
    }
    return { success: false, error: `${res.status}: ${body}` };
  }

  // Set topics if provided
  if (opts.topics?.length) {
    await fetch(`${GITHUB_API}/repos/${opts.org}/${opts.name}/topics`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ names: opts.topics }),
    });
  }

  return { success: true };
}

/**
 * Push multiple files to a repo in a single commit via Git Trees API.
 * No git clone needed — everything via REST.
 */
export async function pushFiles(opts: {
  org: string;
  repo: string;
  files: Array<{ path: string; content: string }>;
  message: string;
  branch?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { org, repo, files, message, branch = 'main' } = opts;
  const baseUrl = `${GITHUB_API}/repos/${org}/${repo}`;
  const h = headers();

  try {
    // 1. Get current commit SHA on the branch
    const refRes = await fetch(`${baseUrl}/git/ref/heads/${branch}`, { headers: h });
    if (!refRes.ok) return { success: false, error: `Failed to get ref: ${refRes.status}` };
    const refData = (await refRes.json()) as { object: { sha: string } };
    const baseSha = refData.object.sha;

    // 2. Get the tree SHA of the current commit
    const commitRes = await fetch(`${baseUrl}/git/commits/${baseSha}`, { headers: h });
    if (!commitRes.ok) return { success: false, error: `Failed to get commit: ${commitRes.status}` };
    const commitData = (await commitRes.json()) as { tree: { sha: string } };
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for each file
    const tree = await Promise.all(
      files.map(async (f) => {
        const blobRes = await fetch(`${baseUrl}/git/blobs`, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ content: f.content, encoding: 'utf-8' }),
        });
        const blobData = (await blobRes.json()) as { sha: string };
        return {
          path: f.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blobData.sha,
        };
      }),
    );

    // 4. Create a new tree
    const treeRes = await fetch(`${baseUrl}/git/trees`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ base_tree: baseTreeSha, tree }),
    });
    if (!treeRes.ok) return { success: false, error: `Failed to create tree: ${treeRes.status}` };
    const treeData = (await treeRes.json()) as { sha: string };

    // 5. Create a new commit
    const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        message,
        tree: treeData.sha,
        parents: [baseSha],
      }),
    });
    if (!newCommitRes.ok) return { success: false, error: `Failed to create commit: ${newCommitRes.status}` };
    const newCommitData = (await newCommitRes.json()) as { sha: string };

    // 6. Update the ref to point to the new commit
    const updateRefRes = await fetch(`${baseUrl}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ sha: newCommitData.sha }),
    });
    if (!updateRefRes.ok) return { success: false, error: `Failed to update ref: ${updateRefRes.status}` };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Delete a repository.
 */
export async function deleteRepo(org: string, repo: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}`, {
    method: 'DELETE',
    headers: headers(),
  });

  if (res.status === 204 || res.status === 404) return { success: true };
  return { success: false, error: `${res.status}: ${await res.text()}` };
}

/**
 * List test repos in the org (by topic).
 */
export async function listTestRepos(org: string): Promise<string[]> {
  const res = await fetch(`${GITHUB_API}/search/repositories?q=topic:ice-test-fixture+org:${org}`, {
    headers: headers(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { items: Array<{ name: string }> };
  return data.items.map((r) => r.name);
}
