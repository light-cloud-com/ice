import type { CanvasNode } from '../../svg-canvas';

export interface SvgLogNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  onToggleFold?: (nodeId: string) => void;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  service: string;
  message: string;
}
