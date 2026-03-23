/**
 * Debug Logger
 *
 * Structured console.debug() with prefixes, gated behind localStorage flag.
 * Enable: localStorage.setItem('ice-debug', 'true')
 * Disable: localStorage.removeItem('ice-debug')
 */

type DebugPrefix = '[ICE:Canvas]' | '[ICE:Blueprint]' | '[ICE:Drop]';

let _debugEnabled: boolean | null = null;

function isDebugEnabled(): boolean {
  if (_debugEnabled === null) {
    try {
      _debugEnabled = localStorage.getItem('ice-debug') === 'true';
    } catch {
      _debugEnabled = false;
    }
  }
  return _debugEnabled;
}

/**
 * Gated debug logger.
 * Only outputs when localStorage 'ice-debug' is 'true'.
 */
export function iceDebug(prefix: DebugPrefix, message: string, data?: unknown): void {
  if (!isDebugEnabled()) return;

  if (data !== undefined) {
    console.debug(`%c${prefix}%c ${message}`, 'color: #8b5cf6; font-weight: bold', 'color: inherit', data);
  } else {
    console.debug(`%c${prefix}%c ${message}`, 'color: #8b5cf6; font-weight: bold', 'color: inherit');
  }
}

/**
 * Log canvas render cycle.
 */
export function logCanvasRender(data: {
  nodeCount: number;
  edgeCount: number;
  visibleCount: number;
  viewLevel: number;
}): void {
  iceDebug(
    '[ICE:Canvas]',
    `Render: ${data.visibleCount}/${data.nodeCount} nodes, ${data.edgeCount} edges, L${data.viewLevel}`,
  );
}

/**
 * Log blueprint expansion.
 */
export function logBlueprint(data: {
  type: string;
  provider?: string;
  childCount: number;
  containerWidth: number;
  containerHeight: number;
}): void {
  iceDebug(
    '[ICE:Blueprint]',
    `Expand: ${data.type} (${data.childCount} children, ${data.containerWidth}x${data.containerHeight})`,
    data,
  );
}

/**
 * Log palette drop.
 */
export function logDrop(data: {
  position: { x: number; y: number };
  targetContainer?: string;
  nodeType: string;
}): void {
  iceDebug(
    '[ICE:Drop]',
    `Drop: ${data.nodeType} at (${Math.round(data.position.x)}, ${Math.round(data.position.y)})`,
    data,
  );
}
