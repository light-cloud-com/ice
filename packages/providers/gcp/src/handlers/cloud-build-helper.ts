/**
 * Cloud Build Helper — Build container images from source repos
 *
 * Uses GCP REST APIs (via ctx.rest_client) to:
 * 1. Ensure an Artifact Registry Docker repository exists
 * 2. Submit a Cloud Build that clones a GitHub repo and builds with Docker
 *
 * This enables "deploy from source" for Cloud Run, similar to `gcloud run deploy --source`.
 *
 * Repository format: accepts both "owner/repo" (GitHub full_name) and full URLs.
 */

import type { GCPHandlerContext } from '../types.js';
import { BUILD_MESSAGES } from '../messages.js';

const ARTIFACT_REGISTRY_BASE = 'https://artifactregistry.googleapis.com/v1';
const CLOUD_BUILD_BASE = 'https://cloudbuild.googleapis.com/v1';

/** Default poll interval for build status (10s) */
const BUILD_POLL_INTERVAL_MS = 10_000;
/** Maximum time to wait for a build (15 min) */
const BUILD_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Parse a repository string into owner and repo components.
 * Accepts:
 *   - "owner/repo" (GitHub full_name from UI)
 *   - "https://github.com/owner/repo"
 *   - "git@github.com:owner/repo.git"
 */
function parse_repository(repository: string): { owner: string; repo: string } | null {
  // Try full GitHub URL first
  const urlMatch = repository.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (urlMatch?.[1] && urlMatch[2]) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  // Try owner/repo format (GitHub full_name)
  const parts = repository.trim().split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }

  return null;
}

/**
 * Ensure an Artifact Registry Docker repository exists.
 * Creates it if not found; ignores 409 (already exists).
 */
export async function ensure_artifact_registry(
  ctx: GCPHandlerContext,
  region: string,
  repoName: string = 'ice-images',
): Promise<void> {
  const parent = `projects/${ctx.project}/locations/${region}`;
  const url = `${ARTIFACT_REGISTRY_BASE}/${parent}/repositories?repositoryId=${repoName}`;

  try {
    await ctx.rest_client.post(url, {
      format: 'DOCKER',
      description: 'ICE auto-created Docker image repository',
    });
  } catch (err: any) {
    // 409 = already exists — that's fine
    const status = err?.status ?? err?.code ?? err?.response?.status;
    const message = err?.message || String(err);
    if (status === 409 || message.includes('ALREADY_EXISTS')) {
      return;
    }
    throw new Error(BUILD_MESSAGES.AR_CREATE_FAILED(repoName, message));
  }
}

/**
 * Submit a Cloud Build to build a container image from a GitHub repository.
 *
 * Strategy: git clone → docker build → push to Artifact Registry.
 * Works with any public GitHub repo — no Cloud Source Repositories mirroring needed.
 *
 * Returns the fully-qualified image URI on success.
 */
export async function build_from_source(
  ctx: GCPHandlerContext,
  region: string,
  repository: string,
  branch: string,
  imageUri: string,
  onLog?: (message: string) => void,
): Promise<string> {
  const buildsUrl = `${CLOUD_BUILD_BASE}/projects/${ctx.project}/builds`;

  const parsed = parse_repository(repository);
  if (!parsed) {
    throw new Error(BUILD_MESSAGES.INVALID_REPO_URL(repository));
  }

  const repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;

  onLog?.(BUILD_MESSAGES.SUBMITTING_BUILD(parsed.owner, parsed.repo, branch));

  // Build config: clone repo via git, then build Docker image
  // This avoids needing Cloud Source Repositories mirroring or GitHub connections.
  const buildBody = {
    steps: [
      // Step 1: Clone the GitHub repo
      {
        name: 'gcr.io/cloud-builders/git',
        args: ['clone', '--depth', '1', '--branch', branch, repoUrl, '/workspace/source'],
      },
      // Step 2: Build with Docker (expects Dockerfile in repo root)
      {
        name: 'gcr.io/cloud-builders/docker',
        args: ['build', '-t', imageUri, '/workspace/source'],
      },
    ],
    images: [imageUri],
    options: {
      logging: 'CLOUD_LOGGING_ONLY',
    },
  };

  // Submit the build
  const createResult = (await ctx.rest_client.post(buildsUrl, buildBody)) as any;
  const buildId = createResult?.metadata?.build?.id || createResult?.name?.split('/')?.pop();

  if (!buildId) {
    throw new Error(BUILD_MESSAGES.NO_BUILD_ID);
  }

  onLog?.(BUILD_MESSAGES.BUILD_STARTED(buildId));

  // Poll until complete
  const statusUrl = `${buildsUrl}/${buildId}`;
  const startTime = Date.now();

  while (Date.now() - startTime < BUILD_TIMEOUT_MS) {
    await sleep(BUILD_POLL_INTERVAL_MS);

    const build = (await ctx.rest_client.get(statusUrl)) as any;
    const status = build?.status;

    if (status === 'SUCCESS') {
      onLog?.(BUILD_MESSAGES.BUILD_SUCCEEDED(imageUri));
      return imageUri;
    }

    if (
      status === 'FAILURE' ||
      status === 'INTERNAL_ERROR' ||
      status === 'CANCELLED' ||
      status === 'TIMEOUT' ||
      status === 'EXPIRED'
    ) {
      const logUrl = build?.logUrl || '';
      throw new Error(BUILD_MESSAGES.BUILD_FAILED(status, logUrl));
    }

    // Still in progress (QUEUED, WORKING, etc.)
    onLog?.(BUILD_MESSAGES.BUILD_IN_PROGRESS(status, Math.round((Date.now() - startTime) / 1000)));
  }

  throw new Error(BUILD_MESSAGES.BUILD_TIMED_OUT);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
