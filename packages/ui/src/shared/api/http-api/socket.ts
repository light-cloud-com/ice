/**
 * Socket.IO singleton + menu-action emitter.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-1 so the per-domain
 * adapter modules can share one socket without each one re-implementing
 * the connection-state observability or the auth-token / transport
 * fallback logic.
 *
 * The socket is module-scoped — `getSocket()` lazy-creates it the first
 * time any consumer asks for it, then reuses the connection for every
 * `subscribeDeployProgress`, `onDeployEvent`, `logs.joinRoom`, and
 * pipeline subscription. Tearing it down would orphan every active
 * room subscription, so we never close it; the page-level lifecycle
 * (refresh / navigate-away) takes care of that.
 *
 * The menu-action callbacks are a similar singleton: any caller of
 * `onMenuAction` registers a callback into the shared Set, and
 * `emitMenuAction` fans the action out to every registered listener.
 */

import { io, type Socket } from 'socket.io-client';

// ─── Menu-action callback registry ──────────────────────────────────────────

type MenuCallback = (action: string) => void;

export const menuCallbacks = new Set<MenuCallback>();

export function emitMenuAction(action: string) {
  menuCallbacks.forEach((cb) => cb(action));
}

// ─── Socket.IO singleton ────────────────────────────────────────────────────
//
// The socket carries every live deploy event (progress, logs, resource
// results, completion). If the connection is broken, the user has to
// refresh the page to see ANY deploy state changes — the HTTP replay
// endpoint (`/stream/:cardId`) is the only fallback.
//
// We aggressively log connection state and force reconnection on errors
// so silent failures are visible in the browser console.

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;
    // `auth: {}` is intentionally an empty object rather than omitted so
    // the server sees `handshake.auth` as defined (some middlewares read
    // it unconditionally). In community edition the server ignores it
    // entirely via the `isDesktopMode` bypass.
    const token = (() => {
      try {
        return localStorage.getItem('ice-token') || undefined;
      } catch {
        return undefined;
      }
    })();

    socket = io(wsUrl, {
      withCredentials: true,
      autoConnect: true,
      // Force websocket first, fall back to polling. This avoids certain
      // proxy/CDN setups that strip the upgrade header.
      transports: ['websocket', 'polling'],
      // Retry forever with exponential backoff — don't silently give up
      // if the first connection fails due to a stale gateway restart.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      auth: token ? { token } : {},
    });

    // ── Visibility into connection state ───────────────────────────
    // These logs are essential for diagnosing "why don't live updates
    // reach my UI" bugs. Leave them in — they're cheap and invaluable.
    socket.on('connect', () => {
      console.log('[ice-socket] connected id=', socket?.id);
    });
    socket.on('disconnect', (reason: string) => {
      console.warn('[ice-socket] disconnected:', reason);
    });
    socket.on('connect_error', (err: Error) => {
      console.error('[ice-socket] connect_error:', err.message);
      // Try again with polling transport if websocket upgrade failed.
      if (socket && (err as any)?.message?.includes('websocket')) {
        (socket.io as any).opts.transports = ['polling', 'websocket'];
      }
    });
    socket.io.on('reconnect', (attempt: number) => {
      console.log('[ice-socket] reconnected after', attempt, 'attempts');
    });
    socket.io.on('reconnect_error', (err: Error) => {
      console.warn('[ice-socket] reconnect_error:', err.message);
    });
  }
  return socket;
}
