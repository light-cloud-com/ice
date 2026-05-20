/**
 * Resource Palette — shared types.
 *
 * Extracted verbatim from `components/resource-palette.tsx` as part of the
 * rf-rpal series (mirroring the rf-pdpl pattern). These are the load-bearing
 * shapes the palette imports across leaf components, sections, and data
 * modules — keep the exports stable so the orchestrator and section files
 * can rely on a single source of truth.
 */

import type React from 'react';

/** Provider IDs supported by ICE blocks. The discriminated union is verbatim
 *  from the source — additions here ripple through `ComponentDef.providers`
 *  and the palette's provider filter. */
export type Provider = 'aws' | 'gcp' | 'azure';

/** Categories list a single block under in the palette. The metadata block
 *  drives the section header (icon + color + tooltip). */
export interface CategoryDef {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  tooltip: string;
}

/** Optional runtime-chip rendered beneath a draggable component item. The
 *  selected runtime is forwarded onto the canvas via the drag payload. */
export interface RuntimeOption {
  label: string;
  value: string;
  icon?: string;
}

/** A draggable block definition in the palette. The `providers` array uses a
 *  wider union than `Provider` because some legacy blueprints still reference
 *  providers we don't currently expose in the filter (kubernetes, alibaba,
 *  oci, digitalocean) — the filter shape is preserved verbatim from source. */
export interface ComponentDef {
  type: string;
  name: string;
  description: string;
  tooltip: string;
  icon: React.ElementType;
  providers: ('aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean' | 'ibm')[];
  category: string;
  runtimes?: RuntimeOption[];
}

/** Public props for the `ResourcePalette` orchestrator. Each section is
 *  toggleable independently; the orchestrator composes them into a vertical
 *  resizable panel group. */
export interface ResourcePaletteProps {
  showProjectSection?: boolean;
  showBlocksSection?: boolean;
  showTemplatesSection?: boolean;
}
