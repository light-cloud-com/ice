/**
 * In-Memory Queue — Fallback for when Redis/BullMQ is unavailable
 *
 * Used by the desktop app (no Redis). Processes jobs sequentially
 * with retry logic. Job state is tracked in Prisma DeployJob table.
 */

type JobProcessor = (job: MemoryJob) => Promise<void>;

export interface MemoryJob {
  id: string;
  name: string;
  data: any;
  attemptsMade: number;
  opts: { attempts?: number };
}

export class InMemoryQueue {
  private queue: MemoryJob[] = [];
  private processing = false;
  private processor: JobProcessor | null = null;
  private onCompleted: ((job: MemoryJob) => void) | null = null;
  private onFailed: ((job: MemoryJob | undefined, err: Error) => void) | null = null;

  async add(name: string, data: any, opts: any = {}): Promise<MemoryJob> {
    const job: MemoryJob = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      data,
      attemptsMade: 0,
      opts: { attempts: opts.attempts || 1 },
    };
    this.queue.push(job);
    this.processNext();
    return job;
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0 || !this.processor) return;

    this.processing = true;
    const job = this.queue.shift()!;

    try {
      job.attemptsMade++;
      await this.processor(job);
      this.onCompleted?.(job);
    } catch (err: any) {
      if (job.attemptsMade < (job.opts.attempts || 1)) {
        this.queue.unshift(job); // retry
      } else {
        this.onFailed?.(job, err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.processing = false;
      this.processNext();
    }
  }

  close(): Promise<void> {
    this.queue = [];
    return Promise.resolve();
  }
}

export class InMemoryWorker {
  constructor(_name: string, processor: JobProcessor, _opts: any = {}) {
    this._processor = processor;
  }

  private _processor: JobProcessor;

  on(event: 'completed' | 'failed', handler: any): void {
    if (event === 'completed') this._onCompleted = handler;
    if (event === 'failed') this._onFailed = handler;
  }

  private _onCompleted: any = null;
  private _onFailed: any = null;

  /** Called by InMemoryQueue when bound */
  _bind(queue: InMemoryQueue): void {
    (queue as any).processor = this._processor;
    (queue as any).onCompleted = this._onCompleted;
    (queue as any).onFailed = this._onFailed;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
