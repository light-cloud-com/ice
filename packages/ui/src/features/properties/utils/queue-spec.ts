/**
 * QueueListField — bespoke renderer for message queue lists.
 *
 * Unlike ListField (plain strings), each queue is shown as a labeled pill
 * with a queue icon, FIFO toggle, and visually-distinct styling so the
 * user knows "each item is a real queue that will be provisioned".
 *
 * Queues are stored as JSON strings: `{"name": "orders", "fifo": false}`.
 * For backwards compat, plain string entries are auto-upgraded on read.
 */
export interface QueueSpec {
  name: string;
  fifo?: boolean;
}

export function parseQueue(raw: string): QueueSpec {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string') {
      return { name: parsed.name, fifo: !!parsed.fifo };
    }
  } catch {
    /* fall through */
  }
  return { name: raw, fifo: false };
}

export function stringifyQueue(q: QueueSpec): string {
  return JSON.stringify({ name: q.name, fifo: !!q.fifo });
}
