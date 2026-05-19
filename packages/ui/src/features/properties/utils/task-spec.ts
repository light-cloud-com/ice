/**
 * TaskSpec — one cron task on a `Compute.CronJob` block.
 *
 * Each cron block holds zero or more tasks; each task carries its own
 * schedule (friendly select + optional raw cron expression) and a
 * user-facing name. Timezone stays block-level since it's almost always
 * shared. Storage shape matches `QueueSpec` — JSON-stringified entries
 * in `node.data.tasks: string[]` — so the existing `ListField`-style
 * Redux plumbing keeps working without a new array type.
 */
/**
 * What a task does when its schedule fires. We keep the action as flat
 * fields rather than a discriminated union so the JSON-stringified
 * serialization (matching QueueListField) stays trivial. The
 * `action_type` discriminator tells which sibling fields are live:
 *
 *   - 'block': calls a block on the canvas (Lambda / Container / Queue).
 *     `action_target_node_id` carries the block id.
 *   - 'http': fires an HTTP request at an external URL. `action_url`
 *     and `action_http_method` carry the request details.
 */
export type TaskActionType = 'block' | 'http';

export interface TaskSpec {
  /** Stable id so React keys + canvas hover refs survive reorders. */
  id: string;
  /** Friendly label (e.g. "Nightly backup"). */
  name: string;
  /** Friendly schedule preset (matches the options in compute.ts). */
  frequency: string;
  /** Raw cron expression when `frequency === 'Custom'`. */
  schedule_expression?: string;
  /** What this task does when the schedule fires. Defaults to 'block'. */
  action_type?: TaskActionType;
  /** Canvas block id this task invokes when `action_type === 'block'`. */
  action_target_node_id?: string;
  /** HTTP endpoint hit when `action_type === 'http'`. */
  action_url?: string;
  /** HTTP method when `action_type === 'http'`. Defaults to GET. */
  action_http_method?: string;
}

const TASK_ID_PREFIX = 'task-';

export function makeTaskId(): string {
  return `${TASK_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
}

export function parseTask(raw: string): TaskSpec {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const actionType = parsed.action_type === 'http' ? 'http' : 'block';
      return {
        id: typeof parsed.id === 'string' && parsed.id ? parsed.id : makeTaskId(),
        name: typeof parsed.name === 'string' ? parsed.name : '',
        frequency: typeof parsed.frequency === 'string' ? parsed.frequency : '',
        schedule_expression: typeof parsed.schedule_expression === 'string' ? parsed.schedule_expression : undefined,
        action_type: actionType,
        action_target_node_id:
          typeof parsed.action_target_node_id === 'string' ? parsed.action_target_node_id : undefined,
        action_url: typeof parsed.action_url === 'string' ? parsed.action_url : undefined,
        action_http_method: typeof parsed.action_http_method === 'string' ? parsed.action_http_method : undefined,
      };
    }
  } catch {
    /* fall through */
  }
  // Legacy form — a bare label string. Upgrade in place.
  return { id: makeTaskId(), name: raw, frequency: '', action_type: 'block' };
}

export function stringifyTask(t: TaskSpec): string {
  const actionType = t.action_type || 'block';
  return JSON.stringify({
    id: t.id || makeTaskId(),
    name: t.name,
    frequency: t.frequency,
    ...(t.schedule_expression ? { schedule_expression: t.schedule_expression } : {}),
    action_type: actionType,
    ...(actionType === 'block' && t.action_target_node_id ? { action_target_node_id: t.action_target_node_id } : {}),
    ...(actionType === 'http' && t.action_url ? { action_url: t.action_url } : {}),
    ...(actionType === 'http' && t.action_http_method ? { action_http_method: t.action_http_method } : {}),
  });
}

/** Default task used when the user adds a new row. */
export function emptyTask(): TaskSpec {
  return { id: makeTaskId(), name: '', frequency: 'Daily at midnight', action_type: 'block' };
}
