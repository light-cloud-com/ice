/**
 * Env Config — Concept wrapper
 *
 * Thin wrapper around the existing envConfigBlueprint. This block holds
 * environment variables that get injected into connected compute blocks
 * (Scalable Backend, SSR Site, Worker, Serverless Function, etc.) at
 * deploy time.
 */

import { envConfigBlueprint } from '../../config/env-config';
import type { ConceptBlueprint } from '../_shared/types';

export const envConfigConceptBlueprint: ConceptBlueprint = {
  ...envConfigBlueprint,
  conceptId: 'env-config',
  visualFamily: 'edge',
};
