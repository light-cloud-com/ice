import type { CanvasNode } from '../../svg-canvas';

export interface SvgGroupNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  childNodes?: CanvasNode[];
  onToggleFold?: (nodeId: string) => void;
  isDragOver?: boolean;
  isDragging?: boolean;
  isChildExiting?: boolean;
  isBlock?: boolean;
  isRenaming?: boolean;
  onDoubleClickLabel?: () => void;
  onRenameCommit?: (newLabel: string) => void;
  onRenameCancel?: () => void;
  /** Level of detail: 3=full, 2=compact, 1=iconic */
  lod?: number;
  /** Current zoom level — used for inverse-zoom scaling at low LOD */
  zoom?: number;
  /** Connection drag state: containers are always invalid targets */
  connectionDragState?: 'valid-target' | 'invalid-target' | 'source' | null;
  /** Highest validation severity for this node (null = no issues) */
  validationSeverity?: 'error' | 'warning' | 'info' | null;
  /** Count of validation issues on this node */
  validationCount?: number;
}

export interface BlockNodeProps {
  node: CanvasNode;
  x: number;
  y: number;
  nodeWidth: number;
  nodeHeight: number;
  displayLabel: string;
  folded: boolean;
  childCount: number;
  accentColor: string;
  blockIcon: { icon: string; label: string; color: string } | null;
  isSelected: boolean;
  isHovered: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  isChildExiting: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleFold: (e: React.MouseEvent) => void;
}
