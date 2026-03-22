# Frontend

The web frontend is a React SPA built with Vite, using Redux Toolkit for state management and a custom SVG-based canvas for infrastructure design.

## Web App (`@lightcloud/web`) {#web-app}

**Location:** `packages/web/`
**Dev:** `pnpm dev:web` (Vite, port 5173)
**Entry:** `src/app/index.tsx`

### Routing

| Route | Component | Auth |
|---|---|---|
| `/login` | `LoginPage` | Public |
| `/signup` | `SignupPage` | Public |
| `/auth/callback` | `AuthCallbackPage` | Public |
| `/onboarding` | `OnboardingPage` | Protected |
| `/invite/:token` | `InviteAcceptPage` | Public |
| `/settings` | `UserSettingsPage` | Protected |
| `/team` | `TeamPage` | Protected |
| `/*` | `DynamicContent` | Protected |

`DynamicContent` resolves path-based navigation to:
- **Folder view** — project browser
- **Project canvas** — `MainLayout` with palette + canvas + properties panels
- **Project table** — tabular resource view
- **Project settings** / **Deployment history**

### Layout

```
┌──────────────────────────────────────────────────┐
│  AppBar (project name, view toggle, user menu)   │
├────────┬──────────────────────────┬──────────────┤
│Resource│                          │  Properties  │
│Palette │      SVG Canvas          │    Panel     │
│        │   (drag, connect,        │  (config,    │
│(blocks,│    deploy blocks)        │   pipeline,  │
│projects│                          │   deploy)    │
│ tree)  │                          │              │
│        ├──────────────────────────┤              │
│        │  Environment Tab Bar     │              │
│        ├──────────────────────────┤              │
│        │  AI Chat Panel           │              │
│        │  (collapsible)           │              │
└────────┴──────────────────────────┴──────────────┘
```

### Feature Modules

| Feature | Directory | Contents |
|---|---|---|
| Canvas | `features/canvas/` | SVG canvas, node renderers, canvas controls |
| AI | `features/ai/` | AI chat panel, operation executor |
| Deploy | `features/deploy/` | Deploy panel (plan + apply) |
| Pipeline | `features/pipeline/` | CI/CD rule config, deployment events |
| Environments | `features/environments/` | Environment tabs, promote modal |
| Palette | `features/palette/` | Block drag source, project tree |
| Properties | `features/properties/` | Node config panel, pipeline config |
| Templates | `features/templates/` | Template picker |
| Onboarding | `features/onboarding/` | 4-step wizard (welcome, team, cloud, project) |
| Wizard | `features/wizard/` | Project creation wizard |
| Account | `features/account/` | Settings, team, profile, org switcher |
| Integrations | `features/integrations/` | GitHub/provider connect modals |
| Toolbar | `features/toolbar/` | View level toggle (LOD) |
| Debug | `features/debug/` | Debug overlay |

### State Management (Redux)

| Slice | Manages |
|---|---|
| `cards` | Canvas nodes, edges, viewport, undo/redo stacks |
| `graph` | `@ice-engine/core` graph instance |
| `ui` | Palette visibility, split pane layout |
| `selection` | Selected node/edge IDs |
| `view` | View level (LOD) toggle |
| `projectList` | Flat project list for sidebar |
| `projects` | Active project + org context |
| `deploy` | Deploy panel state, deploy status |
| `integrations` | GitHub/GCP/AWS/Azure connection status |
| `account` | User profile |
| `ai` | AI chat state, streaming ops |
| `pipeline` | CI/CD pipeline status per node |
| `environments` | Environment list, active environment |
| `onboarding` | Onboarding step state |
| `debug` | Debug overlay data |

### Auto-Save

The store subscriber watches for canvas changes, debounces 2 seconds, then:
1. Saves to `localStorage` (offline resilience)
2. Saves to backend via `api.canvas.save(cardId, data)`

A dirty check via quick hash prevents unnecessary saves.

### Canvas

The canvas is a **custom SVG implementation** — not React Flow. Key components:

- `SvgCanvas` — main canvas container with pan/zoom
- `SvgUnifiedNode` — standard resource node renderer
- `SvgGroupNode` — group/region container
- `SvgCompactNode` — compact view (LOD)
- `SvgConnectionPath` — edge renderer
- `SelectionFrame` — multi-select drag
- `CanvasMinimap` — overview minimap
- `CanvasContextMenu` — right-click context menu

---

## UI Library (`@ice-saas/ui`) {#ui-library}

**Location:** `packages/ui/`

Shared React component library consumed by both web and desktop apps. Contains all major application panels and a primitive design system.

### Sub-path Exports

```typescript
import { SvgCanvas, SvgUnifiedNode } from '@ice-saas/ui/canvas'
import { DeployPanel } from '@ice-saas/ui/deploy'
import { PropertiesPanel } from '@ice-saas/ui/properties'
import { ResourcePalette } from '@ice-saas/ui/palette'
import { PipelinePanel } from '@ice-saas/ui/pipeline'
import { TemplatePicker } from '@ice-saas/ui/templates'
import { EnvironmentTabBar } from '@ice-saas/ui/environments'
import { AiChatPanel } from '@ice-saas/ui/ai'
import { Button, Input, Dialog } from '@ice-saas/ui/primitives/button'
```

### Design System

- **Primitives:** Radix UI components styled with Tailwind CSS
- **Styling:** `class-variance-authority` for variant management, `tailwind-merge` for class merging
- **Icons:** Lucide React
- **Layout:** `react-resizable-panels` for split pane layouts

### Primitive Components

`button`, `input`, `textarea`, `select`, `dialog`, `dropdown-menu`, `badge`, `separator`, `tooltip`, `label`, `switch`, `scroll-area`, `resizable`, `tabs`, `card`, `combobox`, `context-menu`

### Tech Stack

React 18, Redux Toolkit, Immer, React Hook Form, Zod, Radix UI, Tailwind CSS, Lucide
