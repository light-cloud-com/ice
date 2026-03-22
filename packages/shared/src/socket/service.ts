/**
 * Socket.IO Service
 *
 * Manages real-time rooms for:
 * - deploy progress (deploy:{cardId})
 * - canvas collaboration (canvas:{projectId})
 * - pipeline status per node (pipeline:{nodeId})
 * - pipeline activity per card (card:{cardId})
 */

import { Server as SocketServer } from 'socket.io';

let _io: SocketServer;

export function setupSocketService(io: SocketServer) {
  _io = io;

  io.on('connection', (socket) => {
    // Deploy progress room
    socket.on('subscribe:deploy', (cardId: string) => {
      socket.join(`deploy:${cardId}`);
    });

    socket.on('unsubscribe:deploy', (cardId: string) => {
      socket.leave(`deploy:${cardId}`);
    });

    // Canvas collaboration room (future)
    socket.on('subscribe:canvas', (projectId: string) => {
      socket.join(`canvas:${projectId}`);
    });

    socket.on('unsubscribe:canvas', (projectId: string) => {
      socket.leave(`canvas:${projectId}`);
    });

    // Pipeline: per-node status (full logs + progress)
    socket.on('subscribe:pipeline', (nodeId: string) => {
      socket.join(`pipeline:${nodeId}`);
    });

    socket.on('unsubscribe:pipeline', (nodeId: string) => {
      socket.leave(`pipeline:${nodeId}`);
    });

    // Pipeline: per-card activity (lightweight status for canvas badges)
    socket.on('subscribe:card-pipeline', (cardId: string) => {
      socket.join(`card-pipeline:${cardId}`);
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
  if (_io) {
    _io.to(`deploy:${cardId}`).emit('deploy:progress', event);
  }
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
