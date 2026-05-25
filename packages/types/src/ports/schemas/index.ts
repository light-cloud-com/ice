/**
 * Port schema registry.
 *
 * Maps iceType → `PortSchema`. The lookup is total for high-level
 * concept blocks — every iceType in the palette has an entry. Unknown
 * iceTypes get an empty port list (no sockets rendered).
 */

import { aiLlmGatewaySchema, aiPrivateAiServiceSchema, aiVectorDbSchema } from './ai';
import {
  computeBackendApiSchema,
  computeContainerSchema,
  computeCronJobSchema,
  computeServerlessFunctionSchema,
  computeSsrSiteSchema,
  computeStaticSiteSchema,
  computeWorkerSchema,
} from './compute';
import { configEnvironmentSchema } from './config';
import {
  databaseMongoSchema,
  databaseMysqlSchema,
  databasePostgresSchema,
  databaseRedisSchema,
  storageBucketSchema,
} from './data';
import { messagingEmailSchema, messagingEventStreamSchema, messagingQueueSchema } from './messaging';
import { monitoringLogSchema } from './monitoring';
import { networkCustomDomainSchema, networkGatewaySchema, networkPrivateNetworkSchema } from './network';
import { securitySecretSchema } from './security';
import { sourceRepositorySchema } from './source';
import { utilRerouteSchema } from './util';
import type { PortSchema } from '../types';

const allSchemas: PortSchema[] = [
  // Compute / frontend / backend
  computeStaticSiteSchema,
  computeSsrSiteSchema,
  computeContainerSchema,
  computeBackendApiSchema,
  computeServerlessFunctionSchema,
  computeWorkerSchema,
  computeCronJobSchema,
  // Data / storage
  databasePostgresSchema,
  databaseMysqlSchema,
  databaseMongoSchema,
  databaseRedisSchema,
  storageBucketSchema,
  // Messaging
  messagingQueueSchema,
  messagingEventStreamSchema,
  messagingEmailSchema,
  // Network
  networkCustomDomainSchema,
  networkGatewaySchema,
  networkPrivateNetworkSchema,
  // Security / config / monitoring / source
  securitySecretSchema,
  configEnvironmentSchema,
  monitoringLogSchema,
  sourceRepositorySchema,
  // AI
  aiVectorDbSchema,
  aiLlmGatewaySchema,
  aiPrivateAiServiceSchema,
  // Util
  utilRerouteSchema,
];

export const PORT_SCHEMAS: Record<string, PortSchema> = Object.fromEntries(allSchemas.map((s) => [s.iceType, s]));

export function getPortSchema(iceType: string): PortSchema | undefined {
  return PORT_SCHEMAS[iceType];
}
