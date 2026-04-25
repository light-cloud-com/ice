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
 * Returns false for 404 (genuinely missing). Treats 200 as exists.
 * Any other response (403, 401, 5xx) throws — we can't silently treat a
 * permission error as "missing" because that cascades into a bogus create
 * attempt and misleading UI output.
 */
export async function repoExists(org: string, repo: string): Promise<boolean> {
  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}`, { headers: headers() });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  const body = await res.text();
  throw new Error(`GitHub repoExists check failed for ${org}/${repo}: ${res.status} ${body}`);
}

/**
 * True if the repo has zero commits on its default branch (freshly created,
 * or created-then-push-failed state). Used so ensureTestRepos can repair
 * empty repos on a rerun instead of silently skipping them.
 */
export async function repoIsEmpty(org: string, repo: string): Promise<boolean> {
  const h = headers();
  const repoRes = await fetch(`${GITHUB_API}/repos/${org}/${repo}`, { headers: h });
  if (!repoRes.ok) return false;
  const data = (await repoRes.json()) as { default_branch?: string; size?: number };
  const branch = data.default_branch || 'main';
  const commitsRes = await fetch(`${GITHUB_API}/repos/${org}/${repo}/commits?sha=${branch}&per_page=1`, { headers: h });
  // GitHub returns 409 "Git Repository is empty" for repos with no commits.
  if (commitsRes.status === 409) return true;
  if (!commitsRes.ok) return false;
  const commits = (await commitsRes.json()) as unknown[];
  return Array.isArray(commits) && commits.length === 0;
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
  const { org, repo, files, message } = opts;
  const baseUrl = `${GITHUB_API}/repos/${org}/${repo}`;
  const h = headers();

  try {
    // auto_init:true on create returns before the initial commit is fully
    // materialized on the default branch. Resolve the actual default branch
    // from the repo metadata (not all repos are "main") and retry on 404 to
    // paper over the race.
    let branch = opts.branch;
    let baseSha: string | null = null;
    const maxAttempts = 6;
    let lastError = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!branch) {
        const repoRes = await fetch(baseUrl, { headers: h });
        if (repoRes.ok) {
          const repoData = (await repoRes.json()) as { default_branch?: string };
          branch = repoData.default_branch || 'main';
        } else {
          branch = 'main';
        }
      }

      const refRes = await fetch(`${baseUrl}/git/ref/heads/${branch}`, { headers: h });
      if (refRes.ok) {
        const refData = (await refRes.json()) as { object: { sha: string } };
        baseSha = refData.object.sha;
        break;
      }
      lastError = `Failed to get ref heads/${branch}: ${refRes.status}`;
      // 404 during the first few seconds is expected for freshly auto_init'd
      // repos. Back off and retry; also reset the cached branch so we re-read
      // default_branch on the next loop in case GitHub picks something else.
      if (refRes.status === 404) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        if (attempt === 2) branch = undefined;
        continue;
      }
      return { success: false, error: lastError };
    }

    if (!baseSha) return { success: false, error: lastError || 'Ref never became available' };

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
 * List test repos in the org. Uses the plain repo-list endpoint with a name
 * prefix filter rather than the search API — search has a 30–60s indexing
 * delay for freshly created repos AND depends on topics being set, which is
 * a separate permission and a separate failure mode. The list endpoint is
 * immediately consistent and authoritative.
 */
export async function listTestRepos(org: string, prefix = 'ice-test-'): Promise<string[]> {
  const h = headers();
  const names: string[] = [];
  let page = 1;
  // Cap pagination — the org shouldn't ever have hundreds of test repos.
  while (page <= 10) {
    const res = await fetch(`${GITHUB_API}/orgs/${org}/repos?per_page=100&page=${page}&type=all`, { headers: h });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`listTestRepos ${org} page ${page}: ${res.status} ${body}`);
    }
    const batch = (await res.json()) as Array<{ name: string }>;
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const r of batch) {
      if (r.name.startsWith(prefix)) names.push(r.name);
    }
    if (batch.length < 100) break;
    page++;
  }
  return names;
}
