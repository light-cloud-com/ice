import type { CanvasNode } from '../../svg-canvas';

export interface NodePipelineStatus {
  status: 'idle' | 'queued' | 'building' | 'deploying' | 'success' | 'failed';
  stage?: string;
  commitSha?: string;
  commitMessage?: string;
  progress?: number;
}

export interface SvgCompactNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  childNodes?: CanvasNode[];
  onToggleFold?: (nodeId: string) => void;
  isDragOver?: boolean;
  onNodeHover?: (nodeId: string | null) => void;
  /** When true, render as a block summary card (Level 1 view) */
  isBlockSummary?: boolean;
  /** Inline rename state */
  isRenaming?: boolean;
  onDoubleClickLabel?: () => void;
  onRenameCommit?: (newLabel: string) => void;
  onRenameCancel?: () => void;
  /** Update node data fields (for +/- controls) */
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  /** Pipeline live status for this node */
  pipelineStatus?: NodePipelineStatus;
  /** Callback when the pipeline badge is clicked */
  onPipelineClick?: (nodeId: string) => void;
  /** For Source.Repository blocks: aggregated pipeline statuses of connected services */
  connectedPipelineStatuses?: NodePipelineStatus[];
  /** Level of detail: 3=full, 2=compact, 1=iconic */
  lod?: number;
  /** Current zoom level — used to size LOD cards inversely to zoom */
  zoom?: number;
  /** Connection drag state: indicates if this node is a valid/invalid target during connection drawing */
  connectionDragState?: 'valid-target' | 'invalid-target' | 'source' | null;
  /** Highest validation severity for this node (null = no issues) */
  validationSeverity?: 'error' | 'warning' | 'info' | null;
  /** Count of validation issues on this node */
  validationCount?: number;
}

export interface ContextResult {
  lines: string[];
  repoLineIndex: number;
}
