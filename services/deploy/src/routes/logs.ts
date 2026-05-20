/**
 * Canvas Logs Routes — REST surface for the Log Terminal block.
 *
 * POST /api/canvas/logs/subscribe   — open (or join) a log stream room
 * POST /api/canvas/logs/unsubscribe — leave; idempotent
 *
 * The actual SDK lifecycle (resolve source, IAM probe, polling/tail loop,
 * `logs:entry` fan-out) lives in `services/log-stream.service.ts`. This
 * router is a thin auth + body-validation shim around that module.
 *
 * `organisationId` is read from `req.organisationId` (populated by
 * `requireAuth`) and NEVER from the body — the body is a client-controlled
 * input and a spoofed org would otherwise route credential lookup to the
 * wrong GCP project. The Socket.IO room name is `logs:<terminalNodeId>`,
 * matching the room LT-3's service emits to; client join handlers live in
 * `packages/shared/src/socket/service.ts`.
 */

import { requireAuth, requireProjectAccess, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';
import * as logStreamService from '../services/log-stream.service';

const router: RouterType = Router();
router.use(requireAuth);

const VALID_MODES = ['polling', 'tail'] as const;

// ── Validation helpers ────────────────────────────────────────────────

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

interface CandidateSource {
  nodeId: string;
  iceType: string;
  label?: string;
}

interface SubscribeBody {
  cardId: string;
  environmentId: string;
  terminalNodeId: string;
  mode: 'polling' | 'tail';
  sourceNodeIdOverride?: string;
  candidateSources?: CandidateSource[];
}

function validateSubscribeBody(body: any): { ok: true; body: SubscribeBody } | { ok: false; details: string[] } {
  const details: string[] = [];
  if (!nonEmptyString(body?.cardId)) details.push('cardId must be a non-empty string');
  if (!nonEmptyString(body?.environmentId)) details.push('environmentId must be a non-empty string');
  if (!nonEmptyString(body?.terminalNodeId)) details.push('terminalNodeId must be a non-empty string');
  if (!nonEmptyString(body?.mode)) {
    details.push(`mode must be one of: ${VALID_MODES.join(', ')}`);
  } else if (!VALID_MODES.includes(body.mode)) {
    details.push(`mode must be one of: ${VALID_MODES.join(', ')}`);
  }
  if (body?.sourceNodeIdOverride !== undefined && !nonEmptyString(body.sourceNodeIdOverride)) {
    details.push('sourceNodeIdOverride must be a non-empty string when provided');
  }

  // `candidateSources` is optional. When provided it's the client's
  // live-Redux view of inbound supported sources, which lets the resolver
  // skip the Prisma `nodes`/`edges` read (the canvas debounces saves by 2s,
  // so the DB row is stale when the user wires an edge then immediately
  // selects the Log block). Validate shape only — let the resolver decide
  // what's "supported".
  let validatedCandidates: CandidateSource[] | undefined;
  if (body?.candidateSources !== undefined) {
    if (!Array.isArray(body.candidateSources)) {
      details.push('candidateSources must be an array when provided');
    } else {
      const out: CandidateSource[] = [];
      for (let i = 0; i < body.candidateSources.length; i++) {
        const candidate = body.candidateSources[i];
        if (!candidate || typeof candidate !== 'object') {
          details.push(`candidateSources[${i}] must be an object`);
          continue;
        }
        if (!nonEmptyString(candidate.nodeId)) {
          details.push(`candidateSources[${i}].nodeId must be a non-empty string`);
          continue;
        }
        if (!nonEmptyString(candidate.iceType)) {
          details.push(`candidateSources[${i}].iceType must be a non-empty string`);
          continue;
        }
        if (candidate.label !== undefined && typeof candidate.label !== 'string') {
          details.push(`candidateSources[${i}].label must be a string when provided`);
          continue;
        }
        out.push({
          nodeId: candidate.nodeId,
          iceType: candidate.iceType,
          ...(typeof candidate.label === 'string' ? { label: candidate.label } : {}),
        });
      }
      validatedCandidates = out;
    }
  }

  if (details.length > 0) return { ok: false, details };
  return {
    ok: true,
    body: {
      cardId: body.cardId,
      environmentId: body.environmentId,
      terminalNodeId: body.terminalNodeId,
      mode: body.mode,
      ...(body.sourceNodeIdOverride ? { sourceNodeIdOverride: body.sourceNodeIdOverride } : {}),
      ...(validatedCandidates !== undefined ? { candidateSources: validatedCandidates } : {}),
    },
  };
}

function validateUnsubscribeBody(
  body: any,
): { ok: true; subscriptionId: string; cardId: string } | { ok: false; details: string[] } {
  const details: string[] = [];
  if (!nonEmptyString(body?.subscriptionId)) details.push('subscriptionId must be a non-empty string');
  // `cardId` is required so that `requireProjectAccess('viewer')` can resolve
  // the project (and authorize the call). Without it, the middleware 400s on
  // every cleanup call and the server-side polling loop is never released.
  if (!nonEmptyString(body?.cardId)) details.push('cardId must be a non-empty string');
  if (details.length > 0) return { ok: false, details };
  return { ok: true, subscriptionId: body.subscriptionId, cardId: body.cardId };
}

// ── Routes ────────────────────────────────────────────────────────────

router.post('/subscribe', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  const validation = validateSubscribeBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: 'invalid request', details: validation.details });
  }

  if (!req.organisationId) {
    // requireAuth populates organisationId for both desktop and JWT paths,
    // so falling through here means the auth context is malformed. Surface
    // it as 400 + actionable detail rather than letting the service crash.
    return res.status(400).json({
      error: 'invalid request',
      details: ['organisationId missing from auth context — please re-login'],
    });
  }

  try {
    const result = await logStreamService.subscribe({
      ...validation.body,
      // organisationId is auth-derived; any value the client put in the
      // body is intentionally ignored to prevent cross-org credential lookups.
      organisationId: req.organisationId,
    });
    return res.status(200).json(result);
  } catch (err: any) {
    // Don't echo arbitrary error messages to the client — they may carry
    // sensitive context (filter strings, project ids). Log server-side
    // and return a generic envelope.
    console.error('[logs/subscribe] internal error:', err);
    return res.status(500).json({ error: 'internal', message: 'Failed to open log stream.' });
  }
});

router.post('/unsubscribe', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  const validation = validateUnsubscribeBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: 'invalid request', details: validation.details });
  }

  try {
    // The LT-3 contract makes unsubscribe idempotent: an unknown
    // subscriptionId is a no-op, not an error. So a thrown error here
    // genuinely is unexpected (e.g. timer cleanup blew up), and we report
    // it as 500.
    await logStreamService.unsubscribe(validation.subscriptionId);
    return res.status(204).send();
  } catch (err: any) {
    console.error('[logs/unsubscribe] internal error:', err);
    return res.status(500).json({ error: 'internal', message: 'Failed to close log stream.' });
  }
});

export default router;
