import type { CanvasNode } from '../../svg-canvas';

export interface SvgLogNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  onToggleFold?: (nodeId: string) => void;
  /** Drag state during a connection-draw — drives the green/red sibling
   *  border + the port opacity, mirroring CardShell. `null` when no
   *  drag is in progress. */
  connectionDragState?: 'valid-target' | 'invalid-target' | 'source' | null;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  service: string;
  message: string;
}
