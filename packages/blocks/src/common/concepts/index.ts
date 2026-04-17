/**
 * Concepts Palette — aggregate barrel
 *
 * Importing this module loads every concept, triggering their side-effect
 * registrations (family + info). Feeds CONCEPT_BLUEPRINTS into the top-level
 * BLOCK_BLUEPRINTS registry in @ice/blocks.
 */

export * from './_shared';

import type { ConceptBlueprint } from './_shared/types';

// Frontend / Compute (6)
import { staticSiteConceptBlueprint } from './static-site';
import { ssrSiteConceptBlueprint } from './ssr-site';
import { scalableBackendConceptBlueprint } from './scalable-backend';
import { serverlessFunctionConceptBlueprint } from './serverless-function';
import { workerConceptBlueprint } from './worker';
import { scheduledTaskConceptBlueprint } from './scheduled-task';

// Data (6)
import { postgresConceptBlueprint } from './postgres';
import { mysqlConceptBlueprint } from './mysql';
import { mongodbConceptBlueprint } from './mongodb';
import { redisCacheConceptBlueprint } from './redis-cache';
import { objectStorageConceptBlueprint } from './object-storage';
import { vectorDbConceptBlueprint } from './vector-db';

// Messaging (3)
import { messageQueueConceptBlueprint } from './message-queue';
import { eventStreamConceptBlueprint } from './event-stream';
import { emailServiceConceptBlueprint } from './email-service';

// Edge / Network (3)
import { apiGatewayConceptBlueprint } from './api-gateway';
import { customDomainConceptBlueprint } from './custom-domain';
import { privateNetworkConceptBlueprint } from './private-network';

// AI (2)
import { llmGatewayConceptBlueprint } from './llm-gateway';
import { privateAiServiceConceptBlueprint } from './private-ai-service';

// Ops (4)
import { observabilityConceptBlueprint } from './observability';
import { secretStoreConceptBlueprint } from './secret-store';
import { githubRepoConceptBlueprint } from './github-repo';
import { envConfigConceptBlueprint } from './env-config';

// Canvas-only viewers (2 — Group is a UI-level primitive, registered separately)
import { logTerminalConceptBlueprint } from './log-terminal';
import { publicTrafficConceptBlueprint } from './public-traffic';

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
