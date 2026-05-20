/**
 * Shared types for the Project Browser feature.
 *
 * Extracted from `components/project-browser.tsx` during rf-pbrws-1.
 */

export interface ProjectNode {
  id: string;
  name: string;
  slug?: string;
  type: 'folder' | 'project';
  parent_id: string | null;
  cards: { id: string; name: string; updated_at: string }[];
  children: ProjectNode[];
}
