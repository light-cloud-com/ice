/**
 * Container image resolution for the Cloud Run handler. Two paths:
 *
 *   1. `properties.repository` set → build from source via Cloud Build.
 *      We ensure the Artifact Registry repo (`ice-images`) exists, then
 *      kick off a build that lands at
 *      `${region}-docker.pkg.dev/${project}/ice-images/${name}:latest`.
 *
 *   2. `properties.image` set (and no repo) → use the explicit image
 *      verbatim. This is the fast path for users who manage their own
 *      registry.
 *
 * If neither is set we throw `HANDLER_MESSAGES.CLOUD_RUN_NO_SOURCE` so
 * the handler can return a clean failure result.
 *
 * The two `reportStep` calls inside the repo path are step 1 (AR repo)
 * and step 2 (build). The build helper itself emits sub-state labels
 * which we forward at our outer index 2 so the progress bar refreshes
 * the label without advancing the step counter — see
 * `cloud-build-helper.ts` for the BUILD_STEP_INDEX note.
 *
 * Extracted from `cloud-run.ts` (rf-crun-2).
 */
import { BUILD_MESSAGES, HANDLER_MESSAGES } from '../../messages.js';
import { build_from_source, ensure_artifact_registry } from '../cloud-build-helper.js';
import type { GCPHandlerContext } from '../../types.js';

/** Artifact Registry repo name ICE uses for every Cloud Run build. */
export const AR_REPO = 'ice-images';

export async function resolve_image(
  name: string,
  properties: Record<string, unknown>,
  region: string,
  ctx: GCPHandlerContext,
  onLog?: (msg: string) => void,
  reportStep?: (index: number, label: string) => void,
): Promise<string> {
  const image = properties.image as string;
  const repository = properties.repository as string;

  // Repository takes priority — if the user linked a repo, build from source
  // even if a previous deploy left an image value on the card node.
  if (repository) {
    const branch = (properties.branch as string) || 'main';
    const imageUri = `${region}-docker.pkg.dev/${ctx.project}/${AR_REPO}/${name}:latest`;

    onLog?.(BUILD_MESSAGES.BUILDING_FROM_SOURCE(repository));
    onLog?.(BUILD_MESSAGES.CREATING_ARTIFACT_REGISTRY(region));

    // Step 1 of the cloud-run create — ensure the AR repo is in place.
    reportStep?.(1, 'Ensuring artifact registry');
    await ensure_artifact_registry(ctx, region, AR_REPO);

    // Step 2 of the cloud-run create — kick off the Cloud Build. The
    // build helper emits sub-state labels at its OWN index (1 within its
    // caller-supplied space); we forward those at our outer index 2 so
    // the bar shows refreshing labels under the same step. See the
    // BUILD_STEP_INDEX note in cloud-build-helper.ts.
    reportStep?.(2, 'Building from source');
    const forwardBuildStep = reportStep
      ? (_inner_index: number, label: string) => reportStep(2, label)
      : undefined;

    return await build_from_source(ctx, region, repository, branch, imageUri, onLog, forwardBuildStep);
  }

  // Fallback: use explicit image (no repo set)
  if (image) return image;

  throw new Error(HANDLER_MESSAGES.CLOUD_RUN_NO_SOURCE);
}

/**
 * Delete every Artifact Registry container image ICE pushed for the
 * given Cloud Run service. The image name in Artifact Registry matches
 * the service name, so we can target a single repository path and
 * delete the whole package — GCP cascades to all versions and tags.
 *
 * Best-effort: 404 / NOT_FOUND are tolerated (package already gone).
 * Other errors propagate so the caller can log them; the Cloud Run
 * delete itself shouldn't fail just because the image cleanup did.
 */
export async function deleteArtifactRegistryImagesForService(
  ctx: GCPHandlerContext,
  serviceName: string,
  region: string,
): Promise<void> {
  const base = `https://artifactregistry.googleapis.com/v1/projects/${ctx.project}/locations/${region}/repositories/${AR_REPO}`;
  const packagePath = `${base}/packages/${encodeURIComponent(serviceName)}`;
  try {
    // Delete the whole package. This cascades to all versions and tags.
    // If the package doesn't exist we'll get a 404, which is fine.
    const op = (await ctx.rest_client.delete(packagePath)) as any;
    // Artifact Registry delete returns a long-running operation — we don't
    // need to wait for it to complete, the cascade happens asynchronously.
    void op;
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('notFound')) {
      return;
    }
    throw err;
  }
}
