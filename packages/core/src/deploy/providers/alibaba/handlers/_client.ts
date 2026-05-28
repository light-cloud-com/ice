/**
 * Shared client-resolution helper. Each handler does
 * `await resolveClient(ctx, 'ecs')` to get its typed client (or null
 * when the SDK package isn't installed).
 *
 * The sdk-loader stores lazy thunks in `ctx.clients`. We unwrap them
 * here so handler bodies don't repeat the same `await .resolve()`
 * dance.
 */

import type { AlibabaHandlerContext } from '../types';

export async function resolveClient(ctx: AlibabaHandlerContext, service: string): Promise<any | null> {
  const thunk = ctx.clients.get(service) as { resolve?: () => Promise<unknown> } | undefined;
  if (!thunk?.resolve) return null;
  return (await thunk.resolve()) as any;
}
