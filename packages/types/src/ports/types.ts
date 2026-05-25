/**
 * Port model — typed connection points anchored to block properties.
 *
 * A "port" is what the canvas renders as a socket dot. Unlike the
 * earlier `SocketDef` (which was derived from the 4-category
 * `CONNECTION_RULES`), a `PortDef` has a specific semantic role
 * (domain, repository, database, http-endpoint, …) that matches its
 * partner by identity. The whole point is determinism: a user looks at
 * a GitHub repo block and a frontend block, sees a matching `repository`
 * dot on each, and knows they snap together because the repo provides
 * source code and the frontend consumes source code.
 *
 * Ports are AUTHORED per high-level iceType (see `./schemas/`) from
 * the block's typed properties in
 * `packages/core/src/resources/high-level-resources/categories/*.ts`.
 * They're not generated from `CONNECTION_RULES` — that 4-category model
 * stays as a coarse legality gate (used by AI, deploy, propagation).
 *
 * Color and shape are explicit per port, with the convention that a
 * port's `peerStyle` keys into the CATEGORY_STYLE table in the UI
 * layer — so a frontend's `domain-in` reads as the same rose color as
 * the Custom Domain block it connects to.
 */

import type { ConnectionCategory } from '@ice/constants';

/**
 * Semantic role of a port. Identity-matched: an OUT port with role X
 * matches an IN port with role X. No aliases — keep the model boring
 * so users can predict it.
 */
export type PortRole =
  /** DNS routing target. CustomDomain.out ↔ Service.in (`custom_domain` property). */
  | 'domain'
  /** Source code repository reference. Repo.out ↔ Service.in (`repository` property). */
  | 'repository'
  /** Environment variable bundle. EnvConfig.out ↔ Service.in (`env_vars`). */
  | 'env'
  /** Secret reference (single secret or bundle). Secret.out ↔ Service.in (`secrets`). */
  | 'secret'
  /** Relational database connection string. Database.out ↔ Backend.in. */
  | 'database'
  /** Cache connection (Redis/Memcache). Cache.out ↔ Backend.in. */
  | 'cache'
  /**
   * Message queue / topic. Queue exposes queue-in (publishers connect)
   * and queue-out (subscribers connect); services have the inverse —
   * a publisher Service has queue-out, a subscriber has queue-in.
   * Direction discriminates the role.
   */
  | 'queue'
  /** Object storage / bucket. Storage.out ↔ Backend.in. */
  | 'storage'
  /** Search index. Search.out ↔ Backend.in. */
  | 'search'
  /** Vector DB. VectorDB.out ↔ Backend.in. */
  | 'vector'
  /** LLM gateway. LLM.out ↔ Backend.in. */
  | 'llm'
  /**
   * HTTP / TCP listener on a service. Services expose http-endpoint OUT
   * (one per listener); consumers (other services, gateways) have
   * http-endpoint IN to receive a URL.
   */
  | 'http-endpoint'
  /** Logs / metrics stream. Service.out ↔ Monitoring.in. */
  | 'monitoring'
  /** Pass-through (reroute node). Accepts and emits any role. */
  | 'any';

export type PortDirection = 'in' | 'out';
export type PortSide = 'left' | 'right' | 'top' | 'bottom';
export type PortShape = 'circle' | 'ring' | 'diamond' | 'square';
export type PortProtocol = 'http' | 'https' | 'tcp' | 'udp' | 'ssh';

/**
 * Semantic "kind" of block this port expects on the other end.
 * Identity-role + opposite-direction matching isn't strict enough on its
 * own — a Backend's `queue-out` (publish) and another Backend's
 * `queue-in` (subscribe) both have role='queue' with opposite
 * directions, but they should NOT connect: a Backend doesn't broker
 * messages to another Backend; both go through a Queue block.
 * `peerKind` enforces that constraint at the port level.
 */
export type PeerKind =
  | 'service' // Compute.* + AI.PrivateAIService
  | 'queue' // Messaging.Queue / EventStream / Email
  | 'database' // Database.PostgreSQL / MySQL / MongoDB
  | 'cache' // Database.Redis
  | 'storage' // Storage.Bucket
  | 'repository' // Source.Repository
  | 'domain' // Network.CustomDomain
  | 'gateway' // Network.Gateway
  | 'env' // Config.Environment
  | 'secret' // Security.Secret
  | 'monitoring' // Monitoring.Log
  | 'vector' // AI.VectorDB
  | 'llm' // AI.LLMGateway
  | 'reroute' // Util.Reroute — universal passthrough
  | 'any'; // wildcard — accepts every kind

/**
 * Maps iceType → PeerKind. Drives the peer-kind cross-check in
 * `canPortsConnect`. Unknown iceTypes fall back to `'any'` so partial
 * data never blocks a legitimate connection.
 */
export function getBlockKind(iceType: string): PeerKind {
  if (iceType.startsWith('Compute.') || iceType === 'AI.PrivateAIService') return 'service';
  if (iceType.startsWith('Messaging.')) return 'queue';
  if (iceType === 'Database.Redis') return 'cache';
  if (iceType.startsWith('Database.')) return 'database';
  if (iceType.startsWith('Storage.')) return 'storage';
  if (iceType === 'Source.Repository') return 'repository';
  if (iceType === 'Network.CustomDomain') return 'domain';
  if (iceType === 'Network.Gateway') return 'gateway';
  if (iceType === 'Config.Environment') return 'env';
  if (iceType === 'Security.Secret') return 'secret';
  if (iceType.startsWith('Monitoring.') || iceType.startsWith('Log.')) return 'monitoring';
  if (iceType === 'AI.VectorDB') return 'vector';
  if (iceType === 'AI.LLMGateway') return 'llm';
  if (iceType === 'Util.Reroute') return 'reroute';
  return 'any';
}

export interface PortDef {
  /** Unique within the block. e.g. `repository-in`, `db-out`, `http-80-out`. */
  id: string;
  direction: PortDirection;
  role: PortRole;
  /** Tooltip-quality label: "Source code", "HTTPS :443", "Custom domain". */
  label: string;
  /** Anchor side for the dot. Wire endpoint may slide via magnetic routing. */
  side: PortSide;
  shape: PortShape;
  /**
   * For an IN port, the `node.data` key this port wires to (e.g.
   * `'custom_domain'` for a frontend's domain-in). When set, accepting
   * a connection writes the source's anchored value here.
   */
  property?: string;
  /** TCP/HTTP listener port number when `role === 'http-endpoint'`. */
  port?: number;
  protocol?: PortProtocol;
  /** True for ports the user added via a multi-port editor — they can remove them too. */
  removable?: boolean;
  /**
   * CATEGORY_STYLE key for the peer block's category — drives socket
   * color. Set to `'Network'` on a frontend's domain-in so the dot
   * reads as Custom Domain (rose) instead of the abstract DNS color.
   */
  peerStyle?: string;
  /**
   * Kind of block this port expects on the other end. Critical for
   * ports whose role is shared by multiple block kinds (queue: a
   * Backend's `queue-out` must only connect to a Queue block, never
   * another Backend). When left unset, no peer-kind check fires —
   * legacy schemas remain permissive.
   */
  peerKind?: PeerKind;
}

/** A high-level port schema for a single iceType. */
export interface PortSchema {
  iceType: string;
  /** Base ports that are always emitted. */
  base: PortDef[];
  /**
   * Dynamic ports derived from `node.data` properties — e.g. a list of
   * exposed HTTP ports on a Compute.Container. Receives the node data
   * and returns extra ports to append to `base`.
   */
  dynamic?: (data: Record<string, unknown>) => PortDef[];
  /**
   * Conditional removal — drop ports from `base` when a property
   * predicate is true (e.g. hide `pipeline-in` until a repo is wired).
   */
  hide?: Array<{
    keys: readonly string[];
    when: (data: Record<string, unknown>) => boolean;
    portIds: readonly string[];
  }>;
}

/** Default anchor side per direction — inputs left, outputs right. */
export const DEFAULT_PORT_SIDE: Record<PortDirection, PortSide> = {
  in: 'left',
  out: 'right',
};

/**
 * Shape per role — chosen for visual distinction at a glance.
 * Categories map to category shapes via `CATEGORY_SHAPE` (kept for
 * backwards compat with the prior socket model), but specific roles
 * can override.
 */
export const ROLE_SHAPE: Record<PortRole, PortShape> = {
  domain: 'square',
  repository: 'diamond',
  env: 'ring',
  secret: 'ring',
  database: 'circle',
  cache: 'circle',
  queue: 'circle',
  storage: 'circle',
  search: 'circle',
  vector: 'circle',
  llm: 'circle',
  'http-endpoint': 'circle',
  monitoring: 'circle',
  any: 'circle',
};

/**
 * The connection category each role contributes to. Used to keep the
 * existing `inferConnectionMeta` + propagation engine firing — when a
 * user drags between two ports, the resulting edge still carries the
 * right `connectionCategory` so the deploy compiler, AI prompt, and
 * propagation rules all keep working unchanged.
 */
export const ROLE_CATEGORY: Record<PortRole, ConnectionCategory> = {
  domain: 'dns',
  repository: 'pipeline',
  env: 'config',
  secret: 'config',
  database: 'traffic',
  cache: 'traffic',
  queue: 'traffic',
  storage: 'traffic',
  search: 'traffic',
  vector: 'traffic',
  llm: 'traffic',
  'http-endpoint': 'traffic',
  monitoring: 'traffic',
  any: 'traffic',
};
