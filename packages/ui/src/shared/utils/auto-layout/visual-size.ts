/**
 * Visual-size resolution for auto-layout.
 *
 * `resolveVisualSize` returns the *true rendered size* of a node, mirroring
 * the logic in `svg-canvas.tsx` where specialty iceTypes override the stored
 * width/height with dynamic computed values. Dagre needs these real sizes —
 * if we feed it the stored 240x160 for a Private Network (rendered as
 * 560x320) or a Custom Domain (rendered tall enough to fit all its route
 * rows), the layout will overlap once rendered.
 *
 * `intrinsicContainerMin` returns the smallest size the renderer will draw
 * a container at, used as the shrink-wrap floor so containers fit tightly
 * to their children instead of inheriting a stale large `owner.height`.
 */

import { PRIVATE_NETWORK_MIN_WIDTH as PN_MIN_WIDTH, PRIVATE_NETWORK_MIN_HEIGHT as PN_MIN_HEIGHT } from '@ice/constants';
import { MIN_CONTAINER_WIDTH, MIN_CONTAINER_HEIGHT, CARD_WIDTH, CARD_HEIGHT } from '../../../config/canvas-constants';
import {
  CD_EXTRA_WIDTH,
  CD_HEADER_HEIGHT,
  CD_DOMAIN_FIELD_HEIGHT,
  CD_ROUTE_ROW_HEIGHT,
  CD_ROUTE_ROW_GAP,
  CD_PADDING,
  CD_ADD_BUTTON_HEIGHT,
  MQ_HEADER_HEIGHT,
  MQ_ROW_HEIGHT,
  MQ_ROW_GAP,
  MQ_PADDING,
  SS_HEADER_HEIGHT,
  SS_ROW_HEIGHT,
  SS_PADDING,
  EC_HEADER_HEIGHT,
  EC_ROW_HEIGHT,
  EC_PADDING,
  ES_HEADER_HEIGHT,
  ES_FIELD_HEIGHT,
  ES_PADDING,
  type LayoutNode,
} from './types';

/**
 * Intrinsic minimum bounds for a container iceType — the smallest size the
 * renderer will draw it at, independent of stored dimensions. Used as the
 * shrink-wrap floor so containers fit tightly to their children instead of
 * inheriting a stale large `owner.height` from a previous session.
 */
export function intrinsicContainerMin(iceType: string): { width: number; height: number } {
  if (iceType === 'Network.PrivateNetwork') {
    return { width: PN_MIN_WIDTH, height: PN_MIN_HEIGHT };
  }
  return { width: MIN_CONTAINER_WIDTH, height: MIN_CONTAINER_HEIGHT };
}

/**
 * Return the true rendered size of a node, mirroring the logic in
 * `svg-canvas.tsx` where specialty iceTypes override the stored
 * width/height with dynamic computed values.
 */
export function resolveVisualSize(node: LayoutNode): { width: number; height: number } {
  const iceType = node.iceType || (node.data?.iceType as string | undefined) || '';
  const data = (node.data || {}) as Record<string, unknown>;
  const storedW = node.width || 0;
  const storedH = node.height || 0;

  if (iceType === 'Network.PrivateNetwork') {
    return {
      width: Math.max(storedW, PN_MIN_WIDTH),
      height: Math.max(storedH, PN_MIN_HEIGHT),
    };
  }
  if (iceType === 'Network.CustomDomain') {
    const routes = (data.routes as unknown[] | undefined) || [];
    const routeCount = Math.max(routes.length, 0);
    return {
      width: CARD_WIDTH + CD_EXTRA_WIDTH,
      height:
        CD_HEADER_HEIGHT +
        CD_DOMAIN_FIELD_HEIGHT +
        CD_PADDING +
        routeCount * (CD_ROUTE_ROW_HEIGHT + CD_ROUTE_ROW_GAP) +
        CD_PADDING +
        CD_ADD_BUTTON_HEIGHT +
        CD_PADDING,
    };
  }

  // Every other iceType: the renderer in svg-canvas.tsx floors node height
  // to CARD_HEIGHT (see `expandedHeight = Math.max(node.height, 160)`). Our
  // specialty compute formulas for Message Queue / Secret Store / Env Config /
  // Email Service (102 / 92 / 92 / 138) underestimate the rendered size and
  // cause overlaps in packed rows. Just mirror the renderer's floor here.
  let h = storedH || CARD_HEIGHT;
  if (iceType === 'Messaging.MessageQueue' || iceType === 'Messaging.Queue') {
    const rows = Math.max(((data.queues as unknown[] | undefined) || []).length, 1);
    h = MQ_HEADER_HEIGHT + MQ_PADDING + rows * (MQ_ROW_HEIGHT + MQ_ROW_GAP) + MQ_PADDING;
  } else if (iceType === 'Messaging.EmailService') {
    h = ES_HEADER_HEIGHT + ES_PADDING + ES_FIELD_HEIGHT * 2 + 6 + ES_PADDING;
  } else if (iceType === 'Security.Secret' || iceType === 'Security.SecretStore') {
    const rows = Math.max(((data.secrets as unknown[] | undefined) || []).length, 1);
    h = SS_HEADER_HEIGHT + SS_PADDING + rows * SS_ROW_HEIGHT + SS_PADDING;
  } else if (iceType === 'Config.EnvConfig' || iceType === 'Config.Env') {
    const rows = Math.max(((data.variables as unknown[] | undefined) || []).length, 1);
    h = EC_HEADER_HEIGHT + EC_PADDING + rows * EC_ROW_HEIGHT + EC_PADDING;
  }

  return {
    width: storedW || CARD_WIDTH,
    height: Math.max(h, CARD_HEIGHT),
  };
}
