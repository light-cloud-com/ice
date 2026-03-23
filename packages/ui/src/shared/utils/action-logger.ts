/**
 * Action Logger — Structured Event Logging for E2E Testing
 *
 * Stores structured JSON events on window.__ICE_ACTION_LOG__ (circular buffer)
 * so Playwright tests can read them via page.evaluate().
 *
 * Enable:  localStorage.setItem('ice-action-log', 'true')
 * Disable: localStorage.removeItem('ice-action-log')
 *
 * Always active in development mode (import.meta.env.DEV).
 */

export interface IceActionEvent {
  ts: number;
  seq: number;
  category: 'ui' | 'api' | 'deploy' | 'canvas' | 'auth' | 'nav' | 'ai' | 'env' | 'state';
  action: string;
  target: string;
  detail: Record<string, unknown>;
  duration_ms?: number;
}

declare global {
  interface Window {
    __ICE_ACTION_LOG__: IceActionEvent[];
    __ICE_ACTION_SEQ__: number;
  }
}

const MAX_EVENTS = 500;

let _enabled: boolean | null = null;

function isEnabled(): boolean {
  if (_enabled === null) {
    try {
      _enabled =
        (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) ||
        localStorage.getItem('ice-action-log') === 'true';
    } catch {
      _enabled = false;
    }
  }
  return _enabled ?? false;
}

function ensureBuffer(): IceActionEvent[] {
  if (!window.__ICE_ACTION_LOG__) {
    window.__ICE_ACTION_LOG__ = [];
    window.__ICE_ACTION_SEQ__ = 0;
  }
  return window.__ICE_ACTION_LOG__;
}

/**
 * Log a structured action event.
 */
export function logAction(
  category: IceActionEvent['category'],
  action: string,
  target: string,
  detail: Record<string, unknown> = {},
  duration_ms?: number,
): void {
  if (!isEnabled()) return;

  const buf = ensureBuffer();
  const event: IceActionEvent = {
    ts: Date.now(),
    seq: window.__ICE_ACTION_SEQ__++,
    category,
    action,
    target,
    detail,
    ...(duration_ms !== undefined ? { duration_ms } : {}),
  };

  buf.push(event);

  // Circular buffer — trim from front
  if (buf.length > MAX_EVENTS) {
    buf.splice(0, buf.length - MAX_EVENTS);
  }

  // Also emit to console for live debugging
  if (typeof console !== 'undefined') {
    console.debug(
      `%c[ICE:Action]%c ${category}.${action} → ${target}`,
      'color: #22c55e; font-weight: bold',
      'color: inherit',
      detail,
    );
  }
}

/**
 * Log an API request (call from axios interceptor).
 */
export function logApiCall(method: string, path: string, body?: unknown): void {
  logAction('api', 'api_call', `${method.toUpperCase()} ${path}`, {
    method,
    path,
    body: body ?? null,
  });
}

/**
 * Log an API response (call from axios interceptor).
 */
export function logApiResponse(method: string, path: string, status: number, data: unknown, duration_ms: number): void {
  logAction(
    'api',
    status >= 400 ? 'api_error' : 'api_response',
    `${method.toUpperCase()} ${path}`,
    { method, path, status, data: data ?? null },
    duration_ms,
  );
}

/**
 * Log a Redux state change (significant actions only).
 */
export function logStateChange(actionType: string, payload?: unknown): void {
  logAction('state', 'dispatch', actionType, { payload: payload ?? null });
}

/**
 * Get all logged events (for programmatic access within the app).
 */
export function getActionLog(): IceActionEvent[] {
  return window.__ICE_ACTION_LOG__ || [];
}

/**
 * Clear the action log buffer.
 */
export function clearActionLog(): void {
  if (window.__ICE_ACTION_LOG__) {
    window.__ICE_ACTION_LOG__.length = 0;
  }
}
