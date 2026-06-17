/**
 * NodeDeployOverlay — live deploy feedback for CardShell-based nodes (CNV1).
 *
 * The deploy panel writes `deploy_status` / `deploy_progress` / `deploy_error`
 * onto every node's data (see `use-deploy-subscription.ts`), but the CardShell
 * family only rendered a footer status dot — the in-flight step and the failure
 * reason were visible only on the legacy `CompactLod3` path. This component
 * surfaces those two missing pieces ON the node, so a developer watching a
 * Postgres/backend block during a deploy sees "building (3/6)" and, on failure,
 * the inline error — without opening the deploy panel.
 *
 * Absolute-positioned at the bottom of the (relative) card so it overlays the
 * body rather than reflowing layout as status changes. Visual styling mirrors
 * the `CompactLod3` overlay verbatim (blue progress / red error, mono font).
 */

import React from 'react';
import { FONT_MONO } from './fonts';

interface DeployProgress {
  step_label?: string;
  step_index?: number;
  step_total?: number;
}

interface NodeDeployOverlayProps {
  deployStatus: string;
  deployProgress?: DeployProgress;
  deployError?: string;
  /** Distance from the card bottom, in px. CardShell raises it above the
   *  status footer; the default suits footer-less compact cards. */
  bottom?: number;
}

function baseStyle(bottom: number): React.CSSProperties {
  return {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom,
    fontSize: 10,
    fontFamily: FONT_MONO,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    pointerEvents: 'none',
  };
}

export const NodeDeployOverlay: React.FC<NodeDeployOverlayProps> = ({
  deployStatus,
  deployProgress,
  deployError,
  bottom = 4,
}) => {
  if (deployStatus === 'deploying' && deployProgress?.step_label) {
    const { step_label, step_index, step_total } = deployProgress;
    const text = step_index != null && step_total != null ? `${step_label} (${step_index}/${step_total})` : step_label;
    return (
      <div data-testid="node-deploy-progress" style={{ ...baseStyle(bottom), color: '#3b82f6' }}>
        {text}
      </div>
    );
  }

  if (deployStatus === 'error' && deployError) {
    return (
      <div data-testid="node-deploy-error" style={{ ...baseStyle(bottom), color: '#ef4444' }} title={deployError}>
        ✗ {deployError}
      </div>
    );
  }

  return null;
};
