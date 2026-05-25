/**
 * Socket schema registry.
 *
 * Maps iceType → `SocketSchema`. Schemas live here (not next to block
 * blueprints in `@ice/blocks`) so `@ice/types` can derive sockets
 * without a circular dependency on `@ice/blocks`.
 *
 * Most blocks need no entry — the default derivation in `derive-sockets.ts`
 * already walks `CONNECTION_RULES` and emits one IN/OUT socket per matching
 * (direction, category) pair. A schema is only needed when sockets
 * depend on the block's *properties* — e.g. Postgres exposes a
 * `replica-out` socket only when `data.replication === true`.
 */

import { postgresSchema } from './postgres';
import { scalableBackendSchema } from './scalable-backend';
import { staticSiteSchema } from './static-site';
import type { SocketSchema } from '../socket-schema';

export const SOCKET_SCHEMAS: Record<string, SocketSchema> = {
  [postgresSchema.iceType]: postgresSchema,
  [scalableBackendSchema.iceType]: scalableBackendSchema,
  [staticSiteSchema.iceType]: staticSiteSchema,
};

export function getSchema(iceType: string): SocketSchema | undefined {
  return SOCKET_SCHEMAS[iceType];
}

export { postgresSchema, scalableBackendSchema, staticSiteSchema };
