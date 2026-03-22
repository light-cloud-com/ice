# Missing Features Backlog

Product features that don't exist yet, organized by area.

## Canvas

### FEAT-1: Canvas search/filter (P2)
No way to search or filter nodes on the canvas. The palette sidebar has search but it filters the block list, not the canvas contents. Users with 20+ nodes need to visually scan to find a resource.

### FEAT-2: Canvas export to image/PDF (P2)
No SVG/PNG/PDF export of the canvas diagram. No `toPng`, `exportSVG`, or canvas snapshot utilities exist. Users can't share architecture diagrams outside the app.

### FEAT-3: "Group selection" action (P3)
Group container nodes exist and Shift+drag enables reparenting, but there's no "Group Selection" action to wrap selected nodes in a new group. Users must drop nodes into pre-existing containers.

### FEAT-4: Zoom-to-fit uses hardcoded width estimate (P3)
**File:** `packages/web/src/features/canvas/components/canvas-controls.tsx`

`handleZoomToFit` uses `window.innerWidth * 0.6` instead of the actual SVG bounding rect. Wrong in split-view or different window sizes.

### FEAT-5: Copy/Paste duplicate uses fragile `setTimeout` hack (P3)
**File:** `packages/web/src/features/canvas/components/context/canvas-context-menu.tsx`

Duplicate fires copy then `setTimeout(() => fireKey('v', true), 50)`. Should dispatch directly.

---

## Collaboration

### FEAT-6: Real-time multi-user collaboration (P2)
Socket.IO is only used for deploy progress events. No multi-user canvas sync, no presence indicators, no CRDT/OT layer, no locked node state. The `canvas:{projectId}` room exists but is unused.

### FEAT-7: Comments / annotations on nodes (P3)
No comment, annotation, or sticky-note feature anywhere. Users can't leave notes for teammates on specific resources.

### FEAT-8: Activity feed / audit log UI (P3)
Backend has `AiAuditLog` and deployment records but no frontend component displays an activity timeline or change log per project.

### FEAT-9: Per-project sharing links (P3)
Team invite and project member management exist, but there's no shareable read-only link or canvas-level permission override separate from org membership.

---

## Deploy

### FEAT-10: Rollback to previous deployment (P2)
Deploy history page exists showing past deployments, but there's no "Rollback to this version" action. All the data is there (`DeployRecord` has full results), just no API or UI to revert.

### FEAT-11: Pre-deploy cost estimation (P2)
Templates carry static `estimatedCost` strings (`$60-120/mo`), but there's no dynamic cost computation at plan time. The deploy plan response has no cost field. Users deploy blind on cost.

### FEAT-12: Drift detection (P2)
No comparison between canvas desired state and actual deployed state. `deployedResources` is tracked in Redux but there's no visual diff or "out of sync" indicator on the canvas.

---

## Import

### FEAT-13: Import from existing cloud infrastructure (P2)
GCP, AWS, and Azure importers exist in `packages/core/src/importers/` but are not wired to any API route or UI. No "scan my GCP project" or "discover AWS resources" flow.

### FEAT-14: Import from Terraform state (P2)
Terraform state importer exists in `packages/core/src/importers/terraform/` but is not exposed via any IPC handler, API route, or UI.

### FEAT-15: Import from Pulumi state (P3)
Same as Terraform — importer code exists but no UI integration.

### FEAT-16: Import from Docker Compose (P3)
No Docker Compose parser or import path exists at all.

---

## Export

### FEAT-17: Export to Terraform / Pulumi / CDK (P2)
No IaC code generation. `expandComposedTemplate` generates canvas nodes but cannot produce HCL, TypeScript CDK, or Pulumi code.

### FEAT-18: Export as diagram-as-code (P3)
No Mermaid, PlantUML, or draw.io XML export.

---

## Project Management

### FEAT-19: Project duplication / clone (P3)
No duplicate/clone action in the project list. No backend endpoint for it.

### FEAT-20: Project archival (P3)
No archive state, no archived projects view. Only hard delete exists.

### FEAT-21: Project tagging / labeling (P3)
No tag or label system on projects, canvases, or nodes. No filter-by-tag in the project browser.

---

## Monitoring & Observability

### FEAT-22: Cost tracking dashboard (P3)
No dashboard showing accumulated or projected cloud spend. Cost figures are all static strings.

### FEAT-23: Resource health monitoring (P3)
`deployedResources` tracks `status` per resource but there's no polling, no health check endpoint, no live health indicators on canvas nodes.

### FEAT-24: Alert configuration (P3)
No alerting setup, no integration with Cloud Monitoring, CloudWatch, or Azure Monitor.

---

## In-App Help & Documentation

### FEAT-25: Block property help text not rendered (P2)
**File:** `packages/web/src/features/properties/components/properties-panel.tsx`

The `HighLevelProperty` interface has a `description` field that is fetched from the API but never rendered as tooltip or helper text in the form fields.

### FEAT-26: Getting started guide / interactive tutorial (P3)
The onboarding flow covers account setup but there's no in-app walkthrough for the canvas ("what is a gateway block?"), no contextual help, no interactive first-canvas tutorial.

### FEAT-27: Block documentation links (P3)
Properties panel shows a short `description` for selected blocks but there are no links to external cloud provider docs, no example configurations, no "learn more" flow.
