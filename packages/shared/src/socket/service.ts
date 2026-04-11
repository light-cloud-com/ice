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
 */

import jwt from 'jsonwebtoken';
import { Server as SocketServer } from 'socket.io';
import { isDesktopMode } from '../auth/middleware.js';

let _io: SocketServer;

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

    socket.on('disconnect', () => {
      // Cleanup handled by Socket.IO
    });
  });
}

// ─── Deploy Progress (existing) ─────────────────────────────────────────────

export function emitDeployProgress(cardId: string, event: any) {
  if (!_io) {
    console.warn('[socket] emitDeployProgress: _io is null — socket service not initialized');
    return;
  }
  const room = `deploy:${cardId}`;
  // Count sockets in the room so we know if anyone is listening. Costly-ish
  // but invaluable for debugging "why don't events reach my client".
  const roomSockets = _io.sockets.adapter.rooms.get(room);
  const listenerCount = roomSockets?.size ?? 0;
  console.log(
    '[socket] emit deploy:progress → ' + room + ' type=' + (event?.type || '?') + ' listeners=' + listenerCount,
  );
  _io.to(room).emit('deploy:progress', event);
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
