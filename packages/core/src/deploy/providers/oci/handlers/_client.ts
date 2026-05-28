/**
 * Shared client-resolution helper. Each handler does
 * `await resolveClient(ctx, 'core')` to get its typed client (or null
 * when the SDK package isn't installed).
 */

import type { OCIHandlerContext } from '../types';

export async function resolveClient(ctx: OCIHandlerContext, service: string): Promise<any | null> {
  const thunk = ctx.clients.get(service) as { resolve?: () => Promise<unknown> } | undefined;
  if (!thunk?.resolve) return null;
  return (await thunk.resolve()) as any;
}
