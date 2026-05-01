/**
 * Stream open + mode-restart for the Log Stream service.
 *
 * Extracted from `log-stream.service.ts` (rf-lstream-7b). The richer
 * counterpart to `stream-lifecycle.ts`: where stream-lifecycle owns
 * the dependency-free "stop / teardown" primitives, this module owns
 * the heavier "open" path that re-derives the filter, lazy-loads the
 * @google-cloud/logging SDK, runs the IAM probe, registers the
 * ActiveStream, and starts the appropriate polling / tail loop.
 *
 * Lives in its own module because the imports here (Prisma,
 * provider-credentials, polling/tail loop entry points) are heavier
 * than what the polling/tail loops themselves should pull in. Splitting
 * keeps log-stream-polling.test.ts and log-stream-tail.test.ts able to
 * mock only `@ice/shared` for their own scope.
 */

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';

import {
  isPermissionDenied,
  probeErrorMessage,
} from './entry-mapping.js';
import { resolveLogFilter } from './filter-resolver.js';
import { startPolling } from './polling.js';
import { emitToRoom, streams } from './registry.js';
import { stopUnderlyingStream } from './stream-lifecycle.js';
import { startTail } from './tail.js';
import type {
  ActiveStream,
  SourceResolution,
  StreamingMode,
  SubscribeArgs,
} from './types.js';

/**
 * One-shot stream setup for a `resolved` source: re-derive the filter +
 * projectId, lazy-load `@google-cloud/logging`, run the IAM probe, and
 * start the polling / tail loop. Returns the registered ActiveStream
 * on success; null on any of the failure modes the caller treats as
 * "open a placeholder denied state":
 *
 *   - card row missing
 *   - mapping row missing
 *   - credentials missing
 *   - resolveLogFilter returned null (defensive)
 *   - SDK loader returned null (build does not include the SDK)
 *   - permission-denied IAM probe (SDK error with code 7)
 *
 * The caller is responsible for emitting `logs:source-resolved` /
 * `logs:error` events when null is returned for the SDK / probe failure
 * modes; this function emits the events for IAM permission-denied and
 * the SDK-missing case because the right error message differs.
 *
 * The cost is one extra DB roundtrip per fresh subscribe (the same
 * card / env / mapping reads that resolveSource ran), which is fine
 * for the room-lifetime cost model — colocating filter derivation with
 * the SDK open keeps the call sites smaller.
 */
export async function openStreamForResolved(
  args: SubscribeArgs,
  resolution: SourceResolution & { state: 'resolved' },
): Promise<ActiveStream | null> {
  // Re-derive filter + projectId. resolveSource already validated all of
  // this — calling it here keeps the filter colocated with the stream
  // open. The cost is one extra DB roundtrip per fresh subscribe, which
  // is fine.
  const card = await prisma.canvasCard.findUnique({
    where: { id: args.cardId },
    select: { project_id: true },
  });
  if (!card) return null;

  const env = await prisma.environment.findUnique({
    where: { id: args.environmentId },
    select: { type: true, region: true },
  });
  const envType = env?.type ?? 'development';
  const region = env?.region ?? undefined;

  const mapping = await prisma.deployedResourceMapping.findFirst({
    where: { card_id: args.cardId, node_id: resolution.sourceNodeId, environment: envType },
    select: { resource_name: true, resource_type: true },
  });
  if (!mapping) return null;

  const credentials = await providerService.getDecryptedCredentials(args.organisationId, 'gcp');
  if (!credentials) return null;
  const projectId = credentials.project_id ?? '';

  const resolved = resolveLogFilter({
    iceType: resolution.iceType,
    resource: { name: mapping.resource_name, type: mapping.resource_type },
    projectId,
    region,
  });
  if (!resolved) return null;
  const filter = resolved.filter;

  // Construct the @google-cloud/logging client via the shared lazy loader.
  const core: any = await import('@ice/core');
  const loggingModule = await core.load_sdk('@google-cloud/logging');
  if (!loggingModule) {
    emitToRoom(args.terminalNodeId, 'logs:error', {
      message: '@google-cloud/logging SDK is not available in this build.',
      recoverable: false,
    });
    return null;
  }

  // Universal credential paths (see sdk-loader.ts comments).
  const loggingClient = new loggingModule.Logging({
    projectId,
    credentials: credentials as Record<string, unknown>,
  });

  // ─── IAM probe (R1). Cheap, runs once. ─────────────────────────────
  try {
    await loggingClient.getEntries({
      filter,
      pageSize: 1,
      resourceNames: [`projects/${projectId}`],
      orderBy: 'timestamp desc',
      autoPaginate: false,
    });
  } catch (err: any) {
    if (isPermissionDenied(err)) {
      const denied: SourceResolution = {
        state: 'permission-denied',
        message: 'Cloud Logging access denied. Grant roles/logging.viewer to the deploy service account.',
      };
      emitToRoom(args.terminalNodeId, 'logs:source-resolved', denied);
      emitToRoom(args.terminalNodeId, 'logs:error', { message: denied.message, recoverable: false });
      return null;
    }
    // Non-PERMISSION_DENIED probe errors are surfaced as recoverable —
    // the polling/tail loop has its own retry that may recover.
    emitToRoom(args.terminalNodeId, 'logs:error', {
      message: probeErrorMessage(err),
      recoverable: true,
    });
  }

  const stream: ActiveStream = {
    terminalNodeId: args.terminalNodeId,
    mode: args.mode,
    filter,
    projectId,
    resolution,
    subscribers: new Map(),
    seenInsertIds: new Set(),
    insertIdOrder: [],
    consecutiveErrors: 0,
    stopped: false,
    loggingClient,
  };
  streams.set(args.terminalNodeId, stream);

  if (args.mode === 'polling') {
    startPolling(stream);
  } else {
    startTail(stream);
  }

  return stream;
}

/**
 * Switch an existing stream's mode without disturbing the registry
 * entry or the subscriber map. Stops the current SDK loop, flips
 * `stream.mode`, and starts the new loop. Last-write-wins between
 * subscribers requesting different modes for the same room.
 */
export async function restartStreamWithMode(
  stream: ActiveStream,
  newMode: StreamingMode,
): Promise<void> {
  stopUnderlyingStream(stream);
  stream.mode = newMode;
  if (newMode === 'polling') {
    startPolling(stream);
  } else {
    startTail(stream);
  }
}
