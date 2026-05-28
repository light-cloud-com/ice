/**
 * Shared client-resolution helper for IBM Cloud handlers.
 */

import type { IBMHandlerContext } from '../types';

export async function resolveClient(ctx: IBMHandlerContext, service: string): Promise<any | null> {
  const thunk = ctx.clients.get(service) as { resolve?: () => Promise<unknown> } | undefined;
  if (!thunk?.resolve) return null;
  return (await thunk.resolve()) as any;
}
