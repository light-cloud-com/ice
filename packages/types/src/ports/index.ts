/**
 * Ports — typed connection points on blocks.
 *
 * Public surface: types (`PortDef`, `PortRole`, `PortSchema`, …),
 * matching primitives (`canPortsConnect`, `rolesCompatible`,
 * `chooseBestTargetPort`), and the derivation entrypoint
 * (`getPortsForNode`, `hasPort`, `findPort`).
 *
 * Replaces (and supersedes) the earlier `@ice/types/sockets` API,
 * which derived sockets from CONNECTION_RULES categories. The old
 * exports remain available as a thin shim that delegates here so
 * existing imports keep resolving during the migration window.
 */

export * from './types';
export { getBlockKind } from './types';
export { canPortsConnect, rolesCompatible, findMatchingPorts, chooseBestTargetPort } from './match';
export { getPortsForNode, hasPort, findPort, _resetPortCache, type NodeForPorts } from './derive';
export { PORT_SCHEMAS, getPortSchema } from './schemas';
export { inferEdgePorts, type InferredEdgePorts } from './infer';
export { getPortAnchorPoint, type Bounds, type Point } from './position';
