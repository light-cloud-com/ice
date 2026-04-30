/**
 * Pure predicates that classify canvas nodes by their iceType / node.type.
 *
 * Folds 5+ inline duplicated `isGroup` / iceType checks scattered across
 * `svg-canvas.tsx` into one named-predicate util (rf-canv-2). Each predicate
 * is a thin shape-test against the verbatim inline expressions it replaces;
 * subtle corner cases (e.g. the `node.type === ('group' as any)` TS cast) are
 * preserved.
 */

type ClassifiableNode = { type?: string; data?: { iceType?: unknown } & Record<string, unknown> };

/** True for `'Network.VPC'` or `'Network.Subnet'` (the two iceTypes that always render as containers). */
export function isVpcOrSubnet(iceType: string): boolean {
  return iceType === 'Network.VPC' || iceType === 'Network.Subnet';
}

/** True for `'Network.PrivateNetwork'`. */
export function isPrivateNetwork(iceType: string): boolean {
  return iceType === 'Network.PrivateNetwork';
}

/** True for any iceType that always renders as a container (VPC / Subnet / PrivateNetwork). */
export function isContainerIceType(iceType: string): boolean {
  return isVpcOrSubnet(iceType) || isPrivateNetwork(iceType);
}

/** True for log-style iceTypes — `'Monitoring.Log'`, `'Observability.Logs'`, or any `Log.*` prefix. */
export function isLogIceType(iceType: string): boolean {
  return iceType === 'Monitoring.Log' || iceType === 'Observability.Logs' || iceType.startsWith('Log.');
}

/** Matches the `isGroup` derivation at the visualNode reducer (Group.* prefix, container/group types, or PrivateNetwork). */
export function isGroupContainer(node: ClassifiableNode): boolean {
  const iceType = (node.data?.iceType as string) || '';
  return (
    iceType.startsWith('Group.') ||
    node.type === 'container' ||
    node.type === ('group' as any) ||
    isPrivateNetwork(iceType)
  );
}

/** Broader node-level container test — container/group types or any container iceType. Subsumes `isContainerIceType` plus the type checks. */
export function isContainerNode(node: ClassifiableNode): boolean {
  const iceType = (node.data?.iceType as string) || '';
  return node.type === 'container' || node.type === ('group' as any) || isContainerIceType(iceType);
}

/** Matches the `isGroupOrBlock` derivation in container-bounds: container or block types, or Group.* iceType. */
export function isGroupOrBlock(node: ClassifiableNode): boolean {
  const iceType = (node.data?.iceType as string) || '';
  return node.type === 'container' || node.type === 'block' || iceType.startsWith('Group.');
}
