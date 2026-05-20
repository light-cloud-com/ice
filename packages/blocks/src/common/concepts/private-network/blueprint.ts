/**
 * Private Network — Concept wrapper
 *
 * Thin wrapper around the existing `privateNetworkBlueprint` from
 * common/networking/private-network.ts. The user validated that block;
 * do NOT change its behavior. This wrapper just pins it to a concept family.
 */

import { privateNetworkBlueprint } from '../../networking/private-network';
import type { ConceptBlueprint } from '../_shared/types';

export const privateNetworkConceptBlueprint: ConceptBlueprint = {
  ...privateNetworkBlueprint,
  conceptId: 'private-network',
  visualFamily: 'edge',
};
