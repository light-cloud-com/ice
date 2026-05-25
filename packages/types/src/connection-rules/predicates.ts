/**
 * Block-type classification predicates.
 *
 * Each predicate inspects an iceType string (and, for `isContainer`,
 * an optional `nodeType`) and returns whether the type belongs to a
 * logical group (database, cache, queue, ...). The CONNECTION_RULES
 * array composes these predicates into source/target classifiers.
 *
 * Cardinal-rule schema-driven: every predicate body is now a one-line
 * lookup against `hasBlockRole` (defined in `@ice/constants/block-
 * classifiers.ts`). The shared role tables there are the single
 * source of truth for "what role does this iceType play?". Adding or
 * removing a single alternation only requires editing the role table.
 *
 * `@ice/core/compute/propagation-rules.ts` reads the same tables, so
 * the two packages can no longer drift apart.
 */

import { hasBlockRole, NETWORK_CONTAINER_TYPES } from '@ice/constants';

export function isDatabase(t: string): boolean {
  return hasBlockRole(t, 'database');
}

export function isCache(t: string): boolean {
  return hasBlockRole(t, 'cache');
}

export function isQueue(t: string): boolean {
  return hasBlockRole(t, 'queue');
}

export function isStorage(t: string): boolean {
  return hasBlockRole(t, 'storage');
}

export function isBackend(t: string): boolean {
  return hasBlockRole(t, 'backend');
}

export function isFrontend(t: string): boolean {
  return hasBlockRole(t, 'frontend');
}

export function isGateway(t: string): boolean {
  return hasBlockRole(t, 'gateway');
}

export function isAuth(t: string): boolean {
  return hasBlockRole(t, 'auth');
}

export function isSecrets(t: string): boolean {
  return hasBlockRole(t, 'secrets');
}

export function isMonitoring(t: string): boolean {
  return hasBlockRole(t, 'monitoring');
}

export function isSearch(t: string): boolean {
  return hasBlockRole(t, 'search');
}

export function isDataWarehouse(t: string): boolean {
  return hasBlockRole(t, 'dataWarehouse');
}

export function isVectorDb(t: string): boolean {
  return hasBlockRole(t, 'vectorDb');
}

export function isLLM(t: string): boolean {
  return hasBlockRole(t, 'llm');
}

export function isRepo(t: string): boolean {
  return hasBlockRole(t, 'repo');
}

export function isEnvConfig(t: string): boolean {
  return hasBlockRole(t, 'envConfig');
}

export function isDomain(t: string): boolean {
  return hasBlockRole(t, 'domain');
}

/**
 * `Network.CustomDomain` is the variant of the domain block that routes
 * DNS to services that already have their own public endpoint (Firebase
 * Hosting, etc.). It's also used NESTED inside a `Network.PrivateNetwork`
 * container to act as that network's public ingress gateway — in the
 * nested case, its routes wire to sibling services inside the parent
 * network's VPC and it compiles to a full LB chain instead of DNS-only.
 *
 * The parent-aware connection check rejects CustomDomain → VPC-internal
 * targets ONLY when the CD is top-level (standalone DNS can't penetrate
 * a VPC). Nested CDs inside a PrivateNetwork can target their siblings
 * because the compiler will synthesize the LB.
 */
export function isCustomDomain(t: string): boolean {
  return hasBlockRole(t, 'customDomain');
}

/**
 * `Network.PrivateNetwork` is a pure container block. Children nest
 * inside via parentId. It has NO ports — all routing goes through a
 * nested `Network.CustomDomain` child when the user wants public
 * ingress.
 */
export function isPrivateNetwork(t: string): boolean {
  return hasBlockRole(t, 'privateNetwork');
}

/**
 * `Util.Reroute` is a pass-through routing dot — not a container, not
 * an infrastructure resource. It exists purely to let users bend wires
 * cleanly. Edges to/from a Reroute inherit the category of the other
 * end via the passthrough rule in rules-data.
 */
export function isReroute(t: string): boolean {
  return hasBlockRole(t, 'reroute');
}

export function isContainer(iceType: string, nodeType?: string): boolean {
  if (nodeType === 'container' || nodeType === 'group') return true;
  // The iceType-only branch shares its set of network container types
  // with `@ice/core`'s `is_container_type` via the canonical
  // `NETWORK_CONTAINER_TYPES` constant in `@ice/constants` — adding a
  // new container type once flips both predicates in lockstep (rf-0c
  // dedup). Group.* is exclusive to this predicate; the core function
  // is type-only and doesn't see node types.
  return (NETWORK_CONTAINER_TYPES as readonly string[]).includes(iceType) || iceType.startsWith('Group.');
}

// ─── Composite predicates (internal building blocks) ────────────────────────

/** Composite: anything deployable (backend + frontend) */
export function isService(t: string): boolean {
  return isBackend(t) || isFrontend(t);
}

/** Composite: anything that can receive DNS traffic */
export function isRoutable(t: string): boolean {
  return isBackend(t) || isFrontend(t) || isGateway(t);
}
