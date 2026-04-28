/**
 * Socket.IO Service
 *
 * Manages real-time rooms for:
 * - deploy progress (deploy:{cardId})
 * - canvas collaboration (canvas:{projectId})
 * - pipeline status per node (pipeline:{nodeId})
 * - pipeline activity per card (card:{cardId})
 *
 * Authentication:
 * - SaaS edition: JWT via handshake auth.token (same token as HTTP routes)
 * - Community edition: auto-seeded local user — skip JWT, mirroring how
 *   `requireAuth` in the HTTP middleware bypasses JWT when `_desktopUserId`
 *   is set. Without this bypass, community-edition clients (which never
 *   carry a JWT) can't open socket connections, and every live deploy
 *   progress event is silently dropped — users would have to refresh the
 *   page to see any deploy state change.
 *
 * Deploy event channel
 * --------------------
 * The deploy emitters below send the discriminated {@link DeployEvent}
 * union over a single Socket.IO event name {@link DEPLOY_EVENT_CHANNEL}
 * (`deploy:event`). The frontend subscribes once with
 * `socket.on('deploy:event', dispatchByType)` and routes by `payload.type`.
 * This unified pattern replaces the legacy `type: 'progress'` aggregate
 * event — there is no backwards-compat window. ICE is pre-1.0 and there
 * are no external listeners to protect; per the
 * "2026-04-28 — Parallel deploy scheduler with per-node live status"
 * decisions entry, the legacy channel is cut clean.
 */

import jwt from 'jsonwebtoken';
import { Server as SocketServer } from 'socket.io';
import {
  DEPLOY_EVENT_CHANNEL,
  type DeployCompleteEvent,
  type DeployEvent,
  type DeployLogEvent,
  type DeployNodeProgressEvent,
  type DeployNodeStatusEvent,
  type DeployRequirementVerifiedEvent,
} from '@ice/types';
import { isDesktopMode } from '../auth/middleware.js';

let _io: SocketServer;

/**
 * Accessor for services that need to emit to ad-hoc rooms (e.g. the
 * log-streaming service emitting `logs:<terminalNodeId>` events).
 *
 * Returns the SocketServer set up by {@link setupSocketService}, or `null`
 * if the gateway hasn't booted yet (e.g. unit tests). Callers should
 * tolerate `null` and skip the emit rather than throwing — the same
 * defensive pattern as the deploy emitters below (see
 * {@link emitDeployNodeStatus} and friends).
 */
export function getSocketServer(): SocketServer | null {
  return _io ?? null;
}

interface SocketAuth {
  userId: string;
  organisationId: string;
}

export function setupSocketService(io: SocketServer) {
  _io = io;
  console.log('[socket] setupSocketService installed');

  // ── Authentication middleware — verify JWT on every connection ──
  io.use((socket, next) => {
    // Community edition: skip JWT validation, use auto-seeded local user.
    const desktop = isDesktopMode();
    if (desktop) {
      (socket.data as SocketAuth).userId = desktop.userId;
      (socket.data as SocketAuth).organisationId = desktop.orgId;
      console.log('[socket] auth: accepted (community edition, userId=' + desktop.userId + ')');
      return next();
    }

    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      console.warn('[socket] auth: REJECTED (no token + not community edition)');
      return next(new Error('Authentication required'));
    }

    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV !== 'test') {
      console.error('[socket] auth: REJECTED (server misconfigured — JWT_SECRET unset)');
      return next(new Error('Server misconfigured'));
    }

    try {
      const payload = jwt.verify(token, secret || 'test-secret') as {
        userId: string;
        organisationId: string;
      };
      (socket.data as SocketAuth).userId = payload.userId;
      (socket.data as SocketAuth).organisationId = payload.organisationId;
      console.log('[socket] auth: accepted (JWT, userId=' + payload.userId + ')');
      next();
    } catch (err: any) {
      console.warn('[socket] auth: REJECTED (JWT verify failed: ' + err.message + ')');
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('[socket] connection: id=' + socket.id + ' userId=' + (socket.data as SocketAuth).userId);
    // Deploy progress room
    socket.on('subscribe:deploy', (cardId: string) => {
      if (typeof cardId === 'string' && cardId.length > 0) {
        socket.join(`deploy:${cardId}`);
        console.log('[socket] joined deploy:' + cardId + ' (socket=' + socket.id + ')');
      }
    });

    socket.on('unsubscribe:deploy', (cardId: string) => {
      socket.leave(`deploy:${cardId}`);
      console.log('[socket] left deploy:' + cardId + ' (socket=' + socket.id + ')');
    });

    // Canvas collaboration room
    socket.on('subscribe:canvas', (projectId: string) => {
      if (typeof projectId === 'string' && projectId.length > 0) {
        socket.join(`canvas:${projectId}`);
      }
    });

    socket.on('unsubscribe:canvas', (projectId: string) => {
      socket.leave(`canvas:${projectId}`);
    });

    // Pipeline: per-node status (full logs + progress)
    socket.on('subscribe:pipeline', (nodeId: string) => {
      if (typeof nodeId === 'string' && nodeId.length > 0) {
        socket.join(`pipeline:${nodeId}`);
      }
    });

    socket.on('unsubscribe:pipeline', (nodeId: string) => {
      socket.leave(`pipeline:${nodeId}`);
    });

    // Pipeline: per-card activity (lightweight status for canvas badges)
    socket.on('subscribe:card-pipeline', (cardId: string) => {
      if (typeof cardId === 'string' && cardId.length > 0) {
        socket.join(`card-pipeline:${cardId}`);
      }
    });

    socket.on('unsubscribe:card-pipeline', (cardId: string) => {
      socket.leave(`card-pipeline:${cardId}`);
    });

    // Log Terminal: per-block live Cloud Logging stream. Room name MUST
    // match the `logs:<terminalNodeId>` prefix that
    // `services/deploy/src/services/log-stream.service.ts` emits to —
    // the HTTP `/api/canvas/logs/subscribe` route opens the upstream SDK
    // stream and fans entries into this room, so a mismatch silently
    // drops every log line.
    socket.on('subscribe:logs', (terminalNodeId: string) => {
      if (typeof terminalNodeId === 'string' && terminalNodeId.length > 0) {
        socket.join(`logs:${terminalNodeId}`);
      }
    });

    socket.on('unsubscribe:logs', (terminalNodeId: string) => {
      if (typeof terminalNodeId === 'string' && terminalNodeId.length > 0) {
        socket.leave(`logs:${terminalNodeId}`);
      }
    });

    socket.on('disconnect', () => {
      // Cleanup handled by Socket.IO
    });
  });
}

// ─── Deploy Events (per-node live status) ───────────────────────────────────
//
// One typed helper per {@link DeployEvent} variant. Per-type (rather than a
// single `emitDeployEvent(cardId, event)`) so TypeScript rejects a callsite
// that passes a malformed payload — e.g. a `node_status` event missing
// `node_id` won't compile. The shared private helper does the wire work; the
// public surface is just the type narrowing.
//
// All five push the discriminated event onto the existing
// `deploy:<cardId>` Socket.IO room over the single event name
// {@link DEPLOY_EVENT_CHANNEL}. Per the
// "2026-04-28 — Parallel deploy scheduler with per-node live status"
// decisions entry, the legacy `emitDeployProgress` aggregate is removed
// without a backwards-compat window — pdl-4 migrates the deploy service
// callsites to these per-type helpers.

export function emitDeployNodeStatus(cardId: string, event: DeployNodeStatusEvent): void {
  emitDeployEvent(cardId, event);
}

export function emitDeployNodeProgress(cardId: string, event: DeployNodeProgressEvent): void {
  emitDeployEvent(cardId, event);
}

export function emitDeployComplete(cardId: string, event: DeployCompleteEvent): void {
  emitDeployEvent(cardId, event);
}

export function emitDeployLog(cardId: string, event: DeployLogEvent): void {
  emitDeployEvent(cardId, event);
}

export function emitDeployRequirementVerified(
  cardId: string,
  event: DeployRequirementVerifiedEvent,
): void {
  emitDeployEvent(cardId, event);
}

/**
 * Internal wire helper shared by the five public emitters above.
 *
 * Defensive `_io === null` guard mirrors the legacy `emitDeployProgress`
 * pattern — tests and early-boot code paths sometimes call emitters
 * before `setupSocketService` has run, and a thrown exception there
 * would crash the caller for no good reason. The listener-count log is
 * preserved because it's the cheapest possible answer to "why aren't
 * events reaching my client" — a `listeners=0` line in stdout is the
 * smoking gun for "the client never joined the room".
 */
function emitDeployEvent(cardId: string, event: DeployEvent): void {
  if (!_io) {
    console.warn('[socket] emitDeployEvent: _io is null — socket service not initialized');
    return;
  }
  const room = `deploy:${cardId}`;
  // Count sockets in the room so we know if anyone is listening. Costly-ish
  // but invaluable for debugging "why don't events reach my client".
  const roomSockets = _io.sockets.adapter.rooms.get(room);
  const listenerCount = roomSockets?.size ?? 0;
  console.log(
    '[socket] emit ' +
      DEPLOY_EVENT_CHANNEL +
      ' type=' +
      event.type +
      ' → ' +
      room +
      ' listeners=' +
      listenerCount,
  );
  _io.to(room).emit(DEPLOY_EVENT_CHANNEL, event);
}

export function emitCanvasUpdate(projectId: string, event: any) {
  if (_io) {
    _io.to(`canvas:${projectId}`).emit('canvas:update', event);
  }
}

// ─── Pipeline Events ────────────────────────────────────────────────────────

/**
 * Full pipeline status update — sent to clients viewing the pipeline panel
 * for a specific node. Includes full deployment logs.
 */
export function emitPipelineUpdate(nodeId: string, event: PipelineStatusUpdate) {
  if (_io) {
    _io.to(`pipeline:${nodeId}`).emit('pipeline:update', event);
  }
}

/**
 * Lightweight pipeline status — sent to all clients viewing a card.
 * Used to update the badge on canvas nodes without flooding with logs.
 */
export function emitCardPipelineUpdate(cardId: string, event: CardPipelineUpdate) {
  if (_io) {
    _io.to(`card-pipeline:${cardId}`).emit('card-pipeline:update', event);
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PipelineStatusUpdate {
  nodeId: string;
  cardId: string;
  status: string;
  deployment_stage?: string | null;
  deployment_logs?: any;
  commit_sha?: string;
  commit_message?: string | null;
  commit_author?: string | null;
  branch?: string;
  deployed_url?: string | null;
  progress?: number;
  error?: string | null;
  started_at?: string;
  duration_seconds?: number | null;
}

export interface CardPipelineUpdate {
  nodeId: string;
  status: string;
  deployment_stage?: string | null;
  commit_sha?: string;
  commit_message?: string | null;
  progress?: number;
}
// tsx reload probe: 1775910432
