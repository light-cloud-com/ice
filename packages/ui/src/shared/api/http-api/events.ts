/**
 * Top-level event listeners + Socket.IO room subscriptions.
 *
 * These methods used to live as flat properties on the IceAPI factory
 * (alongside `graph`, `schema`, etc.) — `onMenuAction`, `onDeployEvent`,
 * `onPipelineUpdate`, `onCardPipelineUpdate`, `subscribeDeployProgress`,
 * `subscribePipeline`, `subscribeCardPipeline`. The `IceAPI` shape is
 * fixed by the desktop adapter, so each builder here returns the
 * single function the orchestrator drops onto the API object.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-6.
 */

import { DEPLOY_EVENT_CHANNEL, type DeployEvent } from '@ice/types';
import type { IceAPI } from '../api-adapter';
import { getSocket, menuCallbacks } from './socket';

/**
 * Register a callback for menu actions emitted from the web toolbar.
 * The `menuCallbacks` Set lives in `socket.ts` so any other module
 * (e.g. a top-level toolbar helper) can fire `emitMenuAction` and
 * have every registered listener receive it.
 */
export function createOnMenuAction(): IceAPI['onMenuAction'] {
  return (callback: (action: string) => void) => {
    menuCallbacks.add(callback);
    return () => {
      menuCallbacks.delete(callback);
    };
  };
}

/**
 * Register a listener on the typed pdl-2 deploy-event channel.
 *
 * pdl-7 — flipped from legacy `deploy:progress` channel + ad-hoc event
 * shapes to the typed pdl-2 contract (`deploy:event` channel,
 * discriminated union `DeployEvent`). The channel name is sourced from
 * the imported constant so a typo on either side surfaces at typecheck
 * time, not as silently-dropped events at runtime.
 */
export function createOnDeployEvent(): IceAPI['onDeployEvent'] {
  return (callback: (event: DeployEvent) => void) => {
    const s = getSocket();
    const wrapped = (event: DeployEvent) => {
      console.log(
        '[ice-socket] ' + DEPLOY_EVENT_CHANNEL,
        event?.type ?? '?',
        (event as any)?.node_id ?? (event as any)?.resource_name ?? '',
      );
      callback(event);
    };
    s.on(DEPLOY_EVENT_CHANNEL, wrapped);
    return () => {
      s.off(DEPLOY_EVENT_CHANNEL, wrapped);
    };
  };
}

export function createOnPipelineUpdate(): IceAPI['onPipelineUpdate'] {
  return (callback: (event: any) => void) => {
    const s = getSocket();
    s.on('pipeline:update', callback);
    return () => {
      s.off('pipeline:update', callback);
    };
  };
}

export function createOnCardPipelineUpdate(): IceAPI['onCardPipelineUpdate'] {
  return (callback: (event: any) => void) => {
    const s = getSocket();
    s.on('card-pipeline:update', callback);
    return () => {
      s.off('card-pipeline:update', callback);
    };
  };
}

/**
 * Subscribe to a deploy room. Always emits the subscribe immediately
 * (socket.io buffers emits on disconnected sockets and flushes them on
 * connect, so this works regardless of current connection state) AND
 * registers a `connect` listener so the subscribe replays on every
 * reconnect — without re-subscribing, a dropped socket that reconnects
 * loses its room membership and live events stop reaching the client
 * until the next full refresh.
 */
export function createSubscribeDeployProgress(): IceAPI['subscribeDeployProgress'] {
  return (cardId: string) => {
    const s = getSocket();
    const emitSubscribe = () => {
      console.log('[ice-socket] subscribe:deploy', cardId, 'connected=', s.connected);
      s.emit('subscribe:deploy', cardId);
    };
    emitSubscribe();
    s.on('connect', emitSubscribe);
    return () => {
      s.off('connect', emitSubscribe);
      s.emit('unsubscribe:deploy', cardId);
    };
  };
}

export function createSubscribePipeline(): IceAPI['subscribePipeline'] {
  return (nodeId: string) => {
    const s = getSocket();
    s.emit('subscribe:pipeline', nodeId);
    return () => {
      s.emit('unsubscribe:pipeline', nodeId);
    };
  };
}

export function createSubscribeCardPipeline(): IceAPI['subscribeCardPipeline'] {
  return (cardId: string) => {
    const s = getSocket();
    s.emit('subscribe:card-pipeline', cardId);
    return () => {
      s.emit('unsubscribe:card-pipeline', cardId);
    };
  };
}
