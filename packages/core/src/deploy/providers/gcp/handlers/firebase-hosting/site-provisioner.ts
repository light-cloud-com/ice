/**
 * Firebase project + hosting-site provisioning. Extracted from
 * `firebase-hosting.ts` so the orchestrator's create/update methods can
 * call into a single layer that owns the "ensure Firebase enabled" and
 * "ensure hosting site exists" idempotency dance.
 *
 * Behaviour preserved verbatim from the original orchestrator (see
 * `state/blueprints/rf-fbh.md` RISK #5 and RISK #6):
 *
 * - `ensureFirebaseProject` accepts BOTH 409 and 400 as adoption signals,
 *   then re-classifies via a message-content probe (`'already'`,
 *   `'ALREADY_EXISTS'`). Pure status-only treatment would mis-classify a
 *   genuine 400 validation error as success.
 * - `ensureHostingSite` adopts on a three-condition GET check
 *   (`getRes.ok && getRes.status !== 404 && getRes.data?.name`). On the
 *   POST path, a 409 is a race / already-exists and forces a follow-up
 *   GET to populate `data` before returning.
 */

import { restRequest, FIREBASE_HOSTING_API, FIREBASE_MGMT_API } from './rest-client.js';
import type { GCPHandlerContext } from '../../types.js';

/**
 * Make sure the GCP project has Firebase enabled. AddFirebase is
 * idempotent — returns 409 ALREADY_EXISTS if it's already a Firebase
 * project, which we treat as success.
 */
export async function ensureFirebaseProject(
  ctx: GCPHandlerContext,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${FIREBASE_MGMT_API}/projects/${ctx.project}:addFirebase`;
  const res = await restRequest(ctx, 'POST', url, {}, { acceptStatuses: [409, 400] });
  if (res.ok) return { ok: true };
  // 409 / 400 both mean "already a Firebase project" in practice.
  const msg = String(res.data?.error?.message || res.data?.message || JSON.stringify(res.data));
  if (msg.includes('already') || msg.includes('ALREADY_EXISTS')) {
    return { ok: true };
  }
  return { ok: false, error: msg };
}

/**
 * Create or adopt the Firebase Hosting site. The default site has the
 * same id as the project; if we want a separate one we POST to /sites
 * with `siteId`. Both paths can return ALREADY_EXISTS, which we treat
 * as adoption.
 */
export async function ensureHostingSite(
  ctx: GCPHandlerContext,
  siteId: string,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  // Try GET first — if the site is already there we adopt it.
  const getRes = await restRequest(
    ctx,
    'GET',
    `${FIREBASE_HOSTING_API}/projects/${ctx.project}/sites/${siteId}`,
    undefined,
    { acceptStatuses: [404] },
  );
  if (getRes.ok && getRes.status !== 404 && getRes.data?.name) {
    return { ok: true, data: getRes.data };
  }
  // Doesn't exist — create it.
  const createRes = await restRequest(
    ctx,
    'POST',
    `${FIREBASE_HOSTING_API}/projects/${ctx.project}/sites?siteId=${siteId}`,
    {},
    { acceptStatuses: [409] },
  );
  if (createRes.ok) {
    if (createRes.status === 409) {
      // Race / already exists — re-fetch.
      const refetch = await restRequest(
        ctx,
        'GET',
        `${FIREBASE_HOSTING_API}/projects/${ctx.project}/sites/${siteId}`,
      );
      return refetch.ok
        ? { ok: true, data: refetch.data }
        : { ok: false, error: 'Site exists but could not be fetched.' };
    }
    return { ok: true, data: createRes.data };
  }
  return {
    ok: false,
    error: String(createRes.data?.error?.message || JSON.stringify(createRes.data)),
  };
}
