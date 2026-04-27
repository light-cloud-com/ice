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

import { BUILD_MESSAGES } from '../messages.js';
import type { GCPHandlerContext } from '../types.js';

const ARTIFACT_REGISTRY_BASE = 'https://artifactregistry.googleapis.com/v1';
const CLOUD_BUILD_BASE = 'https://cloudbuild.googleapis.com/v1';
const CLOUD_LOGGING_BASE = 'https://logging.googleapis.com/v2';

/** Max log lines we surface in error messages. Beyond this the user is
 *  better off opening the Cloud Build console URL anyway. */
const MAX_LOG_LINES_IN_ERROR = 80;
/** Max characters per log line we surface — Cloud Build sometimes emits
 *  giant single-line stack traces; we trim each so the error message stays
 *  readable in the deploy panel. */
const MAX_LOG_LINE_CHARS = 500;

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
    throw new Error(BUILD_MESSAGES.AR_CREATE_FAILED(repoName, message), { cause: err });
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
  const cancelUrl = `${statusUrl}:cancel`;
  const startTime = Date.now();
  const signal = ctx.abort_signal;

  // Active remote-cancel: when the user hits Cancel on the deploy panel,
  // call Cloud Build's cancel API so the remote build actually stops
  // (and stops accruing billing) instead of only aborting our local poll
  // loop. Fire-and-forget — we still break out via the signal check below.
  if (signal) {
    const onAbort = () => {
      ctx.rest_client
        .post(cancelUrl, {})
        .then(() => onLog?.('Cloud Build cancel requested.'))
        .catch((err: any) => {
          onLog?.(`Cloud Build cancel failed (may have already finished): ${err?.message || err}`);
        });
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  while (Date.now() - startTime < BUILD_TIMEOUT_MS) {
    if (signal?.aborted) {
      throw new Error('Cloud Build cancelled by user');
    }
    await sleep(BUILD_POLL_INTERVAL_MS, signal);
    if (signal?.aborted) {
      throw new Error('Cloud Build cancelled by user');
    }

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
      // Pull the log tail from Cloud Logging so the user gets the actual
      // failure reason (npm error, Dockerfile error, etc.) without having
      // to open the Cloud Build console. We also stream each line via
      // onLog so it shows up live in the deploy panel's log section.
      const logLines = await fetch_build_logs(ctx, buildId, onLog).catch(() => [] as string[]);
      throw new Error(BUILD_MESSAGES.BUILD_FAILED(status, logUrl, logLines));
    }

    // Still in progress (QUEUED, WORKING, etc.)
    onLog?.(BUILD_MESSAGES.BUILD_IN_PROGRESS(status, Math.round((Date.now() - startTime) / 1000)));
  }

  throw new Error(BUILD_MESSAGES.BUILD_TIMED_OUT);
}

/**
 * Fetch the Cloud Build log tail from Cloud Logging.
 *
 * The build helper sets `logging: 'CLOUD_LOGGING_ONLY'` so each build's
 * stdout/stderr lands in Cloud Logging under
 * `resource.type="build" resource.labels.build_id=<id>`. We pull the last
 * MAX_LOG_LINES_IN_ERROR entries so the deploy panel's error message
 * shows the actual failure (npm error, Dockerfile error, etc.) instead
 * of just a "go open the console" URL.
 *
 * Best-effort: any failure here (missing API enable, IAM, network) is
 * swallowed by the caller — the build is already failed; missing logs
 * just means the user falls back to the console URL like before.
 */
async function fetch_build_logs(
  ctx: GCPHandlerContext,
  buildId: string,
  onLog?: (msg: string) => void,
): Promise<string[]> {
  const filter = `resource.type="build" AND resource.labels.build_id="${buildId}"`;
  const body = {
    resourceNames: [`projects/${ctx.project}`],
    filter,
    orderBy: 'timestamp asc',
    pageSize: MAX_LOG_LINES_IN_ERROR,
  };

  const res = (await ctx.rest_client.post(`${CLOUD_LOGGING_BASE}/entries:list`, body)) as any;
  const entries: any[] = Array.isArray(res?.entries) ? res.entries : [];
  if (entries.length === 0) return [];

  const lines: string[] = [];
  for (const entry of entries) {
    const text =
      typeof entry?.textPayload === 'string'
        ? entry.textPayload
        : entry?.jsonPayload?.message
          ? String(entry.jsonPayload.message)
          : '';
    if (!text) continue;
    // Cloud Logging entries can have embedded newlines in textPayload —
    // split so each visual line is its own log entry, then trim each.
    for (const raw of text.split('\n')) {
      const trimmed = raw.replace(/\s+$/, '');
      if (!trimmed) continue;
      const clipped = trimmed.length > MAX_LOG_LINE_CHARS ? `${trimmed.slice(0, MAX_LOG_LINE_CHARS)}…` : trimmed;
      lines.push(clipped);
      onLog?.(`[cloud-build] ${clipped}`);
    }
  }

  return lines.slice(-MAX_LOG_LINES_IN_ERROR);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
