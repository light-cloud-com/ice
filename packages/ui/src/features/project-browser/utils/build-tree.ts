/**
 * Tree-construction utility for the Project Browser.
 *
 * Extracted from `components/project-browser.tsx` during rf-pbrws-3.
 *
 * Takes a flat list of nodes (each with `parent_id`, no `children` yet),
 * returns the root nodes with `children` arrays populated. Nodes whose
 * `parent_id` does not resolve to a node in the list become roots.
 */

import type { ProjectNode } from '../types/project-node';

export function buildTree(flat: ProjectNode[]): ProjectNode[] {
  const map = new Map<string, ProjectNode>();
  const roots: ProjectNode[] = [];
  for (const item of flat) map.set(item.id, item);
  for (const item of flat) {
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(item);
    } else {
      roots.push(item);
    }
  }
  return roots;
}
