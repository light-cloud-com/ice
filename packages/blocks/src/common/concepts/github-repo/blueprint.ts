/**
 * GitHub Repo — Concept wrapper
 *
 * Thin wrapper around the existing `githubRepositoryBlueprint`. Validated
 * block; do not change behavior.
 */

import { githubRepositoryBlueprint } from '../../source/github-repository';
import type { ConceptBlueprint } from '../_shared/types';

export const githubRepoConceptBlueprint: ConceptBlueprint = {
  ...githubRepositoryBlueprint,
  conceptId: 'github-repo',
  visualFamily: 'canvas-only',
};
