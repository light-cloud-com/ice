/**
 * Project Tree — drag-payload encoding helpers.
 *
 * Extracted verbatim from `../components/project-tree.tsx` (rf-ptree-1). The
 * tree's drag-and-drop handlers stash a string of the form `"<type>:<id>"`
 * on the dataTransfer's `text/plain` slot. Both encode + decode are pure;
 * decode returns `null` for any payload whose prefix isn't one of the two
 * recognised types — projects are draggable into folders, folders into
 * other folders, no third class exists.
 *
 * Behavior preserved verbatim:
 *   - encode: `${type}:${id}` (no escaping, IDs are UUIDs in practice).
 *   - decode: split on the FIRST `:` (so an id containing colons survives),
 *             type-narrow guard rejects anything other than 'project'/'folder'.
 */

export type DragItemType = 'project' | 'folder';

export function encodeDrag(type: DragItemType, id: string): string {
  return `${type}:${id}`;
}

export function decodeDrag(data: string): { type: DragItemType; id: string } | null {
  const sep = data.indexOf(':');
  if (sep === -1) return null;
  const type = data.slice(0, sep) as DragItemType;
  const id = data.slice(sep + 1);
  if (type !== 'project' && type !== 'folder') return null;
  return { type, id };
}
