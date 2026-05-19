/**
 * REST transport for the Firebase Hosting handler. Extracted from
 * `firebase-hosting.ts` so the site provisioner, version publisher,
 * domain registrar, and DNS extractor can share the same wrapper around
 * the rest_client's `requestRaw` helper.
 *
 * Behaviour preserved verbatim from the original orchestrator (see
 * `state/blueprints/rf-fbh.md` RISK #4):
 *
 * - Constants `FIREBASE_HOSTING_API` / `FIREBASE_MGMT_API` carry the
 *   v1beta1 base URLs every Firebase call concatenates against.
 * - `restRequest` always passes `validateStatus: () => true` to the
 *   underlying `requestRaw`, so non-2xx responses do NOT throw — the
 *   caller decides what's an error. The only inclusion gate is the
 *   `acceptStatuses` list, which expands the success set beyond
 *   `< 300`. There is no partial validator and no other branch.
 * - Network errors (thrown promises from `requestRaw`) are normalized
 *   into `{ ok: false, status: 0, data: { error: { message } } }` so
 *   the caller never has to wrap each call in try/catch.
 */

import type { GCPHandlerContext } from '../../types';

/** Base URL for Firebase Hosting REST APIs (sites, versions, releases). */
export const FIREBASE_HOSTING_API = 'https://firebasehosting.googleapis.com/v1beta1';

/** Base URL for Firebase project-management APIs (`addFirebase`, etc.). */
export const FIREBASE_MGMT_API = 'https://firebase.googleapis.com/v1beta1';

/**
 * Normalized response shape returned by `restRequest`. `ok` reflects
 * the inclusion gate `< 300 || acceptStatuses.includes(status)`; the
 * raw `status` and parsed `data` are preserved for the caller's
 * downstream logic (message-content probes, 409 re-fetch paths, etc.).
 */
export interface RestResponse {
  ok: boolean;
  status: number;
  data: any;
}

/**
 * Lightweight REST helper that delegates to the rest_client's `requestRaw`
 * (attached by sdk-loader) so we have full control over status codes and
 * binary bodies. Firebase Hosting frequently returns 409 ALREADY_EXISTS,
 * which is "adopt the existing site" — we don't want the auth client's
 * default behaviour of throwing on 4xx, we want to inspect and decide.
 */
export async function restRequest(
  ctx: GCPHandlerContext,
  method: string,
  url: string,
  body?: any,
  options: { contentType?: string; binary?: boolean; acceptStatuses?: number[] } = {},
): Promise<RestResponse> {
  const requestRaw = (ctx.rest_client as any).requestRaw as
    | ((opts: {
        method: string;
        url: string;
        body?: unknown;
        contentType?: string;
        responseType?: 'json' | 'text' | 'arraybuffer';
        validateStatus?: (status: number) => boolean;
      }) => Promise<{ status: number; data: any; headers: Record<string, string> }>)
    | undefined;
  if (!requestRaw) {
    throw new Error('Firebase Hosting handler requires the extended rest_client (requestRaw missing).');
  }
  try {
    const res = await requestRaw({
      method,
      url,
      body,
      contentType: options.contentType,
      responseType: 'json',
      validateStatus: () => true,
    });
    const accepted = res.status < 300 || (options.acceptStatuses?.includes(res.status) ?? false);
    return { ok: accepted, status: res.status, data: res.data };
  } catch (err: any) {
    return {
      ok: false,
      status: err?.response?.status || 0,
      data: err?.response?.data || { error: { message: err?.message || String(err) } },
    };
  }
}
