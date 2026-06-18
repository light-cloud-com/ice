/**
 * Spotlight (Shift+A) spawn helpers — pure logic extracted from `spotlight.tsx`
 * so the provider-resolution + fallback-node decisions are unit-testable and
 * stay consistent with the drag-drop add path (`use-canvas-drop.ts`).
 *
 * CD1 — prefer the active deploy provider when the block supports it (the
 *       spotlight previously always took `providers[0]`, diverging from drag).
 * CD5 — carry `gateBlocked` onto the fallback node as `providerUnsupported` and
 *       stamp the resolved `effectiveProvider` (not the raw deploy provider), so
 *       both add paths render the same unsupported-warning state.
 */

import type { ComponentDef } from '../../../palette/types';

type Provider = ComponentDef['providers'][number];

export interface SpotlightProviderResolution {
  /** The provider the block should spawn against. */
  effectiveProvider: Provider | undefined;
  /** True when the block's category isn't enabled for `effectiveProvider`. */
  gateBlocked: boolean;
}

/**
 * Resolve which provider a Shift+A spawn should target, and whether that lands
 * on a provider that doesn't support the block.
 */
export function resolveSpotlightProvider(
  iceType: string,
  providers: readonly Provider[],
  deployProvider: string | undefined,
  isEnabled: (iceType: string, provider: Provider) => boolean,
): SpotlightProviderResolution {
  const prefersDeploy = !!deployProvider && (providers as readonly string[]).includes(deployProvider);
  const effectiveProvider: Provider | undefined = prefersDeploy
    ? (deployProvider as Provider)
    : (providers[0] ?? (deployProvider as Provider | undefined));
  const gateBlocked = !!effectiveProvider && !isEnabled(iceType, effectiveProvider);
  return { effectiveProvider, gateBlocked };
}

/**
 * Build the data for the bare fallback resource node spawned when no blueprint
 * resolves — mirroring the drag path's `newNodeData` (including the
 * `providerUnsupported` flag that drives the warning badge + deploy refusal).
 */
export function buildSpotlightFallbackData(
  cmd: { name: string; iceType: string },
  effectiveProvider: Provider | undefined,
  gateBlocked: boolean,
): Record<string, unknown> {
  return {
    label: cmd.name,
    iceType: cmd.iceType,
    behavior: 'singleton',
    folded: false,
    provider: effectiveProvider,
    ...(gateBlocked ? { providerUnsupported: true } : {}),
  };
}
