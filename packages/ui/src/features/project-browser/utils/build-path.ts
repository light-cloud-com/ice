/**
 * Project Browser path-building utilities.
 *
 * Extracted from `components/project-browser.tsx` during rf-pbrws-1.
 *
 * `buildPath` walks up the parent chain to construct the URL path for a
 * project node, prepending the org slug. `flattenItems` traverses the
 * top-level project items + their children into a single flat array,
 * concatenated with the existing flat folders list (since folders may not
 * be reachable through `items` alone — root-level folders are tree roots).
 */

import { toSlug } from '../../../shared/utils/slug';
import type { ProjectNode } from '../types/project-node';

/**
 * Walks up parent_id chain from `node`, slugifying names along the way,
 * then prepends the organisation's slug to produce a leading-slash URL.
 *
 * `selectedOrgName`: undefined → no org prefix (legacy fallback path).
 */
export function buildPath(
  node: ProjectNode,
  allItems: ProjectNode[],
  selectedOrgName: string | undefined,
): string {
  const parts: string[] = [];
  let current: ProjectNode | undefined = node;

  // Walk up via parent_id to build full path
  while (current) {
    const slug =
      current.slug ||
      current.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    parts.unshift(slug);
    if (current.parent_id) {
      current = allItems.find((n) => n.id === current!.parent_id);
    } else {
      break;
    }
  }

  // Prepend org slug
  const orgSlug = selectedOrgName ? toSlug(selectedOrgName) : '';
  return orgSlug ? `/${orgSlug}/${parts.join('/')}` : '/' + parts.join('/');
}

/**
 * Flattens the tree under `items` (recursively walking children) and
 * concatenates with `flatFolders`. Used by handlers that need to find a
 * node's parent by id without re-fetching from the backend.
 */
export function flattenItems(items: ProjectNode[], flatFolders: ProjectNode[]): ProjectNode[] {
  return flatFolders.concat(
    items.flatMap(function flatten(n: ProjectNode): ProjectNode[] {
      return [n, ...(n.children || []).flatMap(flatten)];
    }),
  );
}
