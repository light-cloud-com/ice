/**
 * HTTP API Adapter — orchestrator
 *
 * Implements `IceAPI` for the web build. Each domain (graph, schema,
 * resources, dialog, projects, provider, templates, github, deploy,
 * pipeline, environments, logs, top-level events) lives in its own
 * module under `./http-api/`. This file composes them into the single
 * object the web app injects in place of `window.api`.
 *
 * Decomposed in rf-httpapi-1..6. The shared Socket.IO singleton +
 * menu-action callback registry live in `./http-api/socket.ts`; both
 * are re-exported here so existing consumers (`emitMenuAction(...)`)
 * keep working.
 */

import { createDeployAdapter } from './http-api/deploy';
import { createDialogAdapter } from './http-api/dialog';
import { createEnvironmentsAdapter } from './http-api/environments';
import {
  createOnCardPipelineUpdate,
  createOnDeployEvent,
  createOnMenuAction,
  createOnPipelineUpdate,
  createSubscribeCardPipeline,
  createSubscribeDeployProgress,
  createSubscribePipeline,
} from './http-api/events';
import { createGithubAdapter } from './http-api/github';
import { createGraphAdapter } from './http-api/graph';
import { createLogsAdapter } from './http-api/logs';
import { createPipelineAdapter } from './http-api/pipeline';
import { createProjectsAdapter } from './http-api/projects';
import { createProviderAdapter } from './http-api/provider';
import { createResourcesAdapter } from './http-api/resources';
import { createSchemaAdapter } from './http-api/schema';
import { emitMenuAction } from './http-api/socket';
import { createTemplatesAdapter } from './http-api/templates';
import type { IceAPI } from './api-adapter';

// Re-export for the existing public surface; consumers calling
// `emitMenuAction(...)` from the toolbar continue to work.
export { emitMenuAction };

// ─── HTTP API Adapter ───────────────────────────────────────────────────────

export function createHttpApiAdapter(): IceAPI {
  return {
    graph: createGraphAdapter(),
    schema: createSchemaAdapter(),
    resources: createResourcesAdapter(),
    dialog: createDialogAdapter(),
    projects: createProjectsAdapter(),
    provider: createProviderAdapter(),
    templates: createTemplatesAdapter(),
    github: createGithubAdapter(),
    deploy: createDeployAdapter(),
    pipeline: createPipelineAdapter(),
    environments: createEnvironmentsAdapter(),
    logs: createLogsAdapter(),

    onMenuAction: createOnMenuAction(),
    onDeployEvent: createOnDeployEvent(),
    onPipelineUpdate: createOnPipelineUpdate(),
    onCardPipelineUpdate: createOnCardPipelineUpdate(),
    subscribeDeployProgress: createSubscribeDeployProgress(),
    subscribePipeline: createSubscribePipeline(),
    subscribeCardPipeline: createSubscribeCardPipeline(),
  };
}
