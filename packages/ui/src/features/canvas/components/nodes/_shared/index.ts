// SVG overlays (must stay SVG — extend beyond node bounds)
export { SelectionRing } from './selection-ring';
export { DragOverGlow } from './drag-over-glow';
export { ConnectionDragGlow } from './connection-drag-glow';
export { ChildExitingIndicator } from './child-exiting-indicator';
export { ConnectionPorts } from './connection-ports';

// HTML components (used inside foreignObject)
export { FoldButton } from './fold-button';
export { StepperButton } from './stepper-button';
export { ResizeHandle } from './resize-handle';
export { ProviderPill } from './provider-pill';
export { StatusDot } from './status-dot';
export { CostLabel } from './cost-label';
export { ValidationBadge } from './validation-badge';
export { EmptyStateText } from './empty-state-text';
export { CategoryIcon } from './category-icon';
export { NodeLabel } from './node-label';
export { NodeHeader } from './node-header';
export { FONT_PRIMARY, FONT_MONO } from './fonts';

// Card chrome + read-only display primitives for bespoke block nodes.
// The canvas is display-only — all editing lives in the properties panel.
export { CardShell } from './card-shell';
export { BlockSidebar } from './block-sidebar';
export { Pill } from './pill';
export { Badge } from './badge';
export { KvLine } from './kv-line';
export { LabelLine } from './label-line';
export { EmptyHint } from './empty-hint';
