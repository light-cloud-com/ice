/**
 * rf-canv-17 — `CanvasDeployBanner` subcomponent.
 *
 * Canvas-level deploy banner: a top-center positioned overlay (absolute,
 * `top: 12`, `translateX(-50%)`, `zIndex: 100`) that shows the current
 * deploy status (Planning / Deploying / Destroying), the terminal/total
 * rollup count, the most-recently-updated applying node + its sub-step
 * label, and a thin progress bar at the bottom of the pill.
 *
 * The component subscribes to `state.deploy.{status, currentDeployCardId,
 * nodesById}` directly so the orchestrator only has to thread the
 * current canvas card id (`activeCard?.id`) as `cardId`. A `null` /
 * `undefined` `cardId` (no active card) is a no-op gate — the banner
 * renders nothing — matching the orchestrator's prior `activeCard?.id &&
 * deployingCardId === activeCard.id` truthy check.
 *
 * Behaviour preserved verbatim from the inline svg-canvas block:
 *   - `showDeployBanner` requires (cardId truthy) AND (deployingCardId ===
 *     cardId) AND (status ∈ {planning, deploying, destroying}). Status
 *     `'idle'`, `'authenticating'`, `'planned'`, `'success'`, `'error'`,
 *     `'cancelled'` all suppress the banner.
 *   - Status text dispatch: `'planning'` → `'Planning deployment…'`,
 *     `'destroying'` → `'Destroying…'`, anything else (only `'deploying'`
 *     reaches this branch given the `showDeployBanner` gate) →
 *     `'Deploying…'`.
 *   - The terminal-of-total count line shows ONLY when status is not
 *     `'planning'` AND `total > 0` — preserving "Planning…" with no rollup
 *     and "Deploying…" with no nodes (no count line).
 *   - The progress bar renders ONLY for `'deploying'` and `'destroying'`
 *     (not for `'planning'`).
 *   - `bannerPct` cap: 0% when total === 0, 100% only when terminal ===
 *     total, otherwise capped at 99% (the legacy "59% → 0%" bouncing-bar
 *     bug is impossible here because the percentage is computed from the
 *     full rollup, not per-resource).
 *   - `bannerActiveNode` picks the most-recently-updated `applying` node
 *     by ISO `last_at` lex-sort.
 *
 * The `<style>` keyframes block for `iceDeployPulse` is co-located with
 * the pulse-dot `<span>` — only this banner consumes the animation, so
 * extracting it alongside keeps the keyframes definition near its only
 * consumer. (If a future banner-elsewhere-in-the-app needs the same
 * animation, lift the keyframes to a global stylesheet rather than
 * dragging this component into a shared subtree.)
 *
 * Per the rf-canv blueprint, this is the last subcomponent extraction
 * before the hooks-extraction phase begins (rf-canv-18 onward).
 */

import React, { useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';

import { deriveRollup, deriveRollupPercentage, type NodeDeployState } from '../../../store/slices/deploy-slice';
import type { RootState } from '../../../store';

export interface CanvasDeployBannerProps {
  /** The current canvas card's id. Pass `activeCard?.id` from the
   * orchestrator. A falsy value suppresses the banner regardless of the
   * deploy slice's state — preserves the orchestrator's prior
   * `activeCard?.id && deployingCardId === activeCard.id` guard. */
  cardId: string | undefined;
}

export const CanvasDeployBanner: React.FC<CanvasDeployBannerProps> = ({ cardId }) => {
  // Live deploy state. The terminal/total count + active-node line both
  // derive from `nodesById`; a fresh map reference per wire event would
  // re-render the canvas on every node_progress tick without `shallowEqual`,
  // so we keep structural equality on the selector.
  const deployStatus = useSelector((state: RootState) => state.deploy.status);
  const deployingCardId = useSelector((state: RootState) => state.deploy.currentDeployCardId);
  const deployNodesById = useSelector(
    (state: RootState) => state.deploy.nodesById,
    shallowEqual,
  );
  const deployRollup = useMemo<ReturnType<typeof deriveRollup>>(
    () => deriveRollup(deployNodesById),
    [deployNodesById],
  );
  // Pick the most recently-updated applying node to display as the
  // "what's happening right now" line. `last_at` is ISO-8601 so lex sort
  // is fine; ties resolve to insertion order which is stable enough.
  const bannerActiveNode = useMemo<NodeDeployState | undefined>(() => {
    let active: NodeDeployState | undefined;
    for (const node of Object.values(deployNodesById)) {
      if (node.status !== 'applying') continue;
      if (!active || node.last_at > active.last_at) active = node;
    }
    return active;
  }, [deployNodesById]);
  const bannerPct = deriveRollupPercentage(deployRollup);
  const showDeployBanner =
    cardId &&
    deployingCardId === cardId &&
    (deployStatus === 'deploying' || deployStatus === 'planning' || deployStatus === 'destroying');

  if (!showDeployBanner) return null;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          background: 'rgba(59, 130, 246, 0.15)',
          border: '1px solid rgba(59, 130, 246, 0.55)',
          color: '#93c5fd',
          padding: '8px 14px',
          borderRadius: 10,
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 4px 20px rgba(59, 130, 246, 0.25)',
          pointerEvents: 'none',
          minWidth: 320,
          maxWidth: 520,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#3b82f6',
            boxShadow: '0 0 8px #3b82f6',
            flexShrink: 0,
            animation: 'iceDeployPulse 1.2s ease-in-out infinite',
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#dbeafe' }}>
            {deployStatus === 'planning'
              ? 'Planning deployment…'
              : deployStatus === 'destroying'
                ? 'Destroying…'
                : 'Deploying…'}
            {deployStatus !== 'planning' && deployRollup.total > 0 && (
              <span style={{ marginLeft: 8, color: '#93c5fd', fontVariantNumeric: 'tabular-nums' }}>
                {deployRollup.terminal} of {deployRollup.total}
              </span>
            )}
          </div>
          {bannerActiveNode && (
            <div
              style={{
                fontSize: 11,
                color: '#93c5fd',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily: 'SF Mono, Fira Code, monospace',
              }}
            >
              {bannerActiveNode.resource_name || bannerActiveNode.node_id}
              {bannerActiveNode.step &&
                ` · ${bannerActiveNode.step.label} (${bannerActiveNode.step.index}/${bannerActiveNode.step.total})`}
            </div>
          )}
        </div>
        {(deployStatus === 'deploying' || deployStatus === 'destroying') && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 2,
              background: 'rgba(59, 130, 246, 0.15)',
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${bannerPct}%`,
                background: '#3b82f6',
                transition: 'width 300ms ease',
              }}
            />
          </div>
        )}
      </div>
      <style>{`
        @keyframes iceDeployPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </>
  );
};
