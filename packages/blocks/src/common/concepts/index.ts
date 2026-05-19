/**
 * Concepts Palette — aggregate barrel
 *
 * Importing this module loads every concept, triggering their side-effect
 * registrations (family + info). Feeds CONCEPT_BLUEPRINTS into the top-level
 * BLOCK_BLUEPRINTS registry in @ice/blocks.
 */

export * from './_shared';

// Frontend / Compute (6) · Data (6) · Analytics (2) · Messaging (3) ·
// Edge / Network (3) · AI (2) · Ops (5 incl. Auth) · Canvas-only viewers
// (1 — Group is a UI-level primitive, registered separately).
import { apiGatewayConceptBlueprint } from './api-gateway';
import { authConceptBlueprint } from './auth';
import { customDomainConceptBlueprint } from './custom-domain';
import { dataWarehouseConceptBlueprint } from './data-warehouse';
import { emailServiceConceptBlueprint } from './email-service';
import { envConfigConceptBlueprint } from './env-config';
import { eventStreamConceptBlueprint } from './event-stream';
import { githubRepoConceptBlueprint } from './github-repo';
import { llmGatewayConceptBlueprint } from './llm-gateway';
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
import { searchEngineConceptBlueprint } from './search-engine';
import { secretStoreConceptBlueprint } from './secret-store';
import { serverlessFunctionConceptBlueprint } from './serverless-function';
import { ssrSiteConceptBlueprint } from './ssr-site';
import { staticSiteConceptBlueprint } from './static-site';
import { vectorDbConceptBlueprint } from './vector-db';
import { workerConceptBlueprint } from './worker';
import type { ConceptBlueprint } from './_shared/types';

/**
 * All Concept blueprints. 28 so far (Group is a UI-level primitive handled
 * at the canvas layer, not a blueprint). Order here determines palette
 * ordering when the palette becomes data-driven in Slice 5.
 *
 * Auth + Data Warehouse + Search were originally deferred from the 23-block
 * cut (see `state/learnings.md` and the project memory for context). Added
 * back when the deferral hit "users explicitly ask for it" — Auth ships as
 * managed identity (Cognito / Firebase Auth / Entra ID); the SaaS-key path
 * (Clerk / Auth0 in Secret Store) still works the same.
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
  // Analytics
  dataWarehouseConceptBlueprint,
  searchEngineConceptBlueprint,
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
  // Ops / Security
  observabilityConceptBlueprint,
  authConceptBlueprint,
  secretStoreConceptBlueprint,
  githubRepoConceptBlueprint,
  envConfigConceptBlueprint,
  // Canvas-only
  publicTrafficConceptBlueprint,
];
