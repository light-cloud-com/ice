/**
 * rf-tgal-1 — ICON_MAP.
 *
 * Lucide-react icons addressable by string id (the JSON template config
 * stores only the icon name; this map turns it into a renderable
 * `React.ElementType`). Used by both the gallery list view (category
 * tab buttons + featured group headers) and the detail/card hero
 * regions.
 *
 * Keep the keys 1:1 with the icon names emitted by the template
 * authoring config so that a missing key falls through to the
 * caller's default (`ICON_MAP[id] || Rocket` pattern in the gallery,
 * `|| Zap` for category tabs).
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
  Heart,
  Landmark,
  Play,
  Cloud,
  Cpu,
  Gamepad2,
  Truck,
  GraduationCap,
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
  Heart,
  Landmark,
  Play,
  Cloud,
  Cpu,
  Gamepad2,
  Truck,
  GraduationCap,
};
