/**
 * Custom Domain — Concept wrapper
 *
 * This is a thin wrapper around the existing `customDomainBlueprint` from
 * common/networking/custom-domain.ts. The user validated that block visually
 * and functionally; do NOT change its behavior. This wrapper just re-exports
 * it as a ConceptBlueprint so it lives in the unified concepts registry.
 */

import { customDomainBlueprint } from '../../networking/custom-domain';
import type { ConceptBlueprint } from '../_shared/types';

export const customDomainConceptBlueprint: ConceptBlueprint = {
  ...customDomainBlueprint,
  conceptId: 'custom-domain',
  visualFamily: 'edge',
};
