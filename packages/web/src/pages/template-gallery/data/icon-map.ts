/**
 * rf-wgal-1 — ICON_MAP (web template gallery).
 *
 * Lucide-react icons addressable by string id. Mirrors the rf-tgal-1
 * pattern but lives in `packages/web` for the full-page route at
 * `/templates`. The web gallery's category set is narrower than the
 * panel-dialog's — only the 12 icons that actually appear in the route
 * UI (`Rocket`/`Brain`/.../`GitBranch`).
 *
 * Keep the keys 1:1 with the icon names emitted by the template
 * authoring config so a missing key falls through to the caller's
 * default (`ICON_MAP[id] || Rocket` for cards, `|| Zap` for category
 * filter chips).
 */

import {
  Rocket,
  Brain,
  BrainCircuit,
  ShieldCheck,
  Zap,
  Server,
  Activity,
  Globe,
  Waypoints,
  ShoppingCart,
  Smartphone,
  GitBranch,
} from 'lucide-react';
import React from 'react';

export const ICON_MAP: Record<string, React.ElementType> = {
  Rocket,
  Brain,
  BrainCircuit,
  ShieldCheck,
  Zap,
  Server,
  Activity,
  Globe,
  Waypoints,
  ShoppingCart,
  Smartphone,
  GitBranch,
};
