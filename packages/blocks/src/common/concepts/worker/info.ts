import { defineSnippets } from '../_shared/code-snippets';
import type { InfoContent } from '../_shared/types';

export const workerInfo: InfoContent = {
  overview: {
    markdown: `
# Worker

A long-running container process that pulls work off a queue and grinds through
it. No HTTP endpoint — workers are invoked indirectly via a **Message Queue**
or triggered on a schedule.

## When to use

- Video / image processing
- ETL pipelines, data imports
- Email send-outs, notification fan-out
- Anything that takes longer than a Serverless Function's timeout

## When NOT to use

- HTTP request handling → **Scalable Backend**
- Short, stateless event work → **Serverless Function**
- Cron jobs → **Scheduled Task**

## Connecting

Pair with a **Message Queue** — the queue feeds the worker. Optionally wire
to **Postgres** / **Redis Cache** / **Object Storage** for state and results.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'ECS Service', type: 'aws_ecs_service', role: 'long-running worker' },
      { name: 'Task Definition', type: 'aws_ecs_task_definition' },
    ],
    gcp: [{ name: 'Cloud Run Worker', type: 'google_cloud_run_v2_service', role: 'no-cpu-throttling worker pool' }],
    azure: [{ name: 'Container App', type: 'azurerm_container_app', role: 'worker replicas' }],
    kubernetes: [{ name: 'Deployment', type: 'kubernetes_deployment_v1' }],
  },
  snippets: defineSnippets({
    ts: `// BullMQ worker consuming a Redis-backed queue
import { Worker } from 'bullmq';
new Worker('jobs', async (job) => {
  await processJob(job.data);
}, { connection: { host: 'redis', port: 6379 } });`,
    py: `# Celery worker
from celery import Celery
app = Celery('tasks', broker='redis://redis:6379/0')

@app.task
def process_job(payload):
    # slow work here
    return 'ok'`,
  }),
  relatedConcepts: ['Compute.ServerlessFunction', 'Messaging.MessageQueue', 'Compute.ScheduledTask'],
};
