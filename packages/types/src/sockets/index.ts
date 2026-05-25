/**
 * Sockets — typed connection points on blocks.
 *
 * Public surface: types (`SocketDef`, `SocketSide`, `SocketDirection`,
 * `SocketShape`), schema (`SocketSchema`, `SocketConditional`,
 * `SocketHide`), and the derivation entrypoints
 * (`getSocketsForNode`, `hasSocket`, `findSocket`).
 *
 * Schemas themselves are an implementation detail — consumers should
 * never import from `./schemas/*` directly; they should ask the
 * derivation API for sockets and trust it to consult the schema
 * registry.
 */

export * from './types';
export type { SocketSchema, SocketConditional, SocketHide } from './socket-schema';
export { getSocketsForNode, hasSocket, findSocket, _resetSocketCache, type NodeForSockets } from './derive-sockets';
