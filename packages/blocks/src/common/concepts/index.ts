/**
 * Concepts Palette — aggregate barrel
 *
 * Importing this module loads every concept, triggering their side-effect
 * registrations (family + info). Feeds CONCEPT_BLUEPRINTS into the top-level
 * BLOCK_BLUEPRINTS registry in @ice/blocks.
 */

export * from './_shared';

// Frontend / Compute (6) · Data (6) · Messaging (3) · Edge / Network (3) ·
// AI (2) · Ops (4) · Canvas-only viewers (2 — Group is a UI-level primitive,
// registered separately).
import { apiGatewayConceptBlueprint } from './api-gateway';
import { customDomainConceptBlueprint } from './custom-domain';
import { emailServiceConceptBlueprint } from './email-service';
import { envConfigConceptBlueprint } from './env-config';
import { eventStreamConceptBlueprint } from './event-stream';
import { githubRepoConceptBlueprint } from './github-repo';
import { llmGatewayConceptBlueprint } from './llm-gateway';
import { logTerminalConceptBlueprint } from './log-terminal';
import { messageQueueConceptBlueprint } from './message-queue';
import { mongodbConceptBlueprint } from './mongodb';
import { mysqlConceptBlueprint } from './mysql';
import { objectStorageConceptBlueprint } from './object-storage';
import { observabilityConceptBlueprint } from './observability';
import { postgresConceptBlueprint } from './postgres';
import { privateAiServiceConceptBlueprint } from './private-ai-service';
import { privateNetworkConceptBlueprint } from './private-network';
import { publicTrafficConceptBlueprint } from './public-traffic';
import { redisCacheConceptBlueprint } from './redis-cache';
import { scalableBackendConceptBlueprint } from './scalable-backend';
import { scheduledTaskConceptBlueprint } from './scheduled-task';
import { secretStoreConceptBlueprint } from './secret-store';
import { serverlessFunctionConceptBlueprint } from './serverless-function';
import { ssrSiteConceptBlueprint } from './ssr-site';
import { staticSiteConceptBlueprint } from './static-site';
import { vectorDbConceptBlueprint } from './vector-db';
import { workerConceptBlueprint } from './worker';
import type { ConceptBlueprint } from './_shared/types';

/**
 * All Concept blueprints. 25 so far (Group is a UI-level primitive handled
 * at the canvas layer, not a blueprint). Order here determines palette
 * ordering when the palette becomes data-driven in Slice 5.
 */
export const CONCEPT_BLUEPRINTS: ConceptBlueprint[] = [
  // Frontend / Compute
  staticSiteConceptBlueprint,
  ssrSiteConceptBlueprint,
  scalableBackendConceptBlueprint,
  serverlessFunctionConceptBlueprint,
  workerConceptBlueprint,
  scheduledTaskConceptBlueprint,
  // Data
  postgresConceptBlueprint,
  mysqlConceptBlueprint,
  mongodbConceptBlueprint,
  redisCacheConceptBlueprint,
  objectStorageConceptBlueprint,
  vectorDbConceptBlueprint,
  // Messaging
  messageQueueConceptBlueprint,
  eventStreamConceptBlueprint,
  emailServiceConceptBlueprint,
  // Edge / Network
  apiGatewayConceptBlueprint,
  customDomainConceptBlueprint,
  privateNetworkConceptBlueprint,
  // AI
  llmGatewayConceptBlueprint,
  privateAiServiceConceptBlueprint,
  // Ops
  observabilityConceptBlueprint,
  secretStoreConceptBlueprint,
  githubRepoConceptBlueprint,
  envConfigConceptBlueprint,
  // Canvas-only
  logTerminalConceptBlueprint,
  publicTrafficConceptBlueprint,
];
