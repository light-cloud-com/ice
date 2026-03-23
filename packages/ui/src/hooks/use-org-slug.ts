/**
 * Org slug utilities
 *
 * The first URL segment is the org slug.
 * e.g. /my-team/folder/project/settings
 */

import { useSelector } from 'react-redux';
import { toSlug } from '../utils/slug';
import type { RootState } from '../store';

/** Get the slug for the currently selected org */
export function useOrgSlug(): string {
  const selectedOrg = useSelector((s: RootState) => s.account?.selectedOrg);
  return selectedOrg ? toSlug(selectedOrg.name) : '';
}

/** Strip the org slug (first segment) from path segments, returns the rest */
export function stripOrgSegment(segments: string[]): string[] {
  return segments.length > 0 ? segments.slice(1) : [];
}
