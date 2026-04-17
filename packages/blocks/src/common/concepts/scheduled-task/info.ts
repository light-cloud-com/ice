import { defineSnippets } from '../_shared/code-snippets';
import type { InfoContent } from '../_shared/types';

export const scheduledTaskInfo: InfoContent = {
  overview: {
    markdown: `
# Scheduled Task

A cron job. Runs code on a schedule and exits. Not an always-on service —
the provider spins up an execution per schedule fire.

## When to use

- Nightly database backups
- Hourly data imports
- Weekly reports and digests
- Cleanup scripts (delete old uploads, expire sessions)

## Schedule format

Standard cron: \`minute hour day month weekday\`. Examples:
- \`0 * * * *\` — every hour
- \`0 3 * * *\` — every day at 3am
- \`0 9 * * 1\` — Mondays at 9am
- \`*/15 * * * *\` — every 15 minutes

## Connecting

Wire to **Postgres** / **Object Storage** / **Secret Store** for data access.
Often used with a **Worker** or **Serverless Function** as the actual job body.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'EventBridge Rule', type: 'aws_cloudwatch_event_rule', role: 'cron trigger' },
      { name: 'Lambda Target', type: 'aws_cloudwatch_event_target' },
    ],
    gcp: [
      { name: 'Cloud Scheduler Job', type: 'google_cloud_scheduler_job' },
    ],
    azure: [
      { name: 'Logic App / Function App timer', type: 'azurerm_linux_function_app', role: 'timer trigger' },
    ],
  },
  snippets: defineSnippets({
    ts: `// AWS Lambda triggered by EventBridge cron
export const handler = async () => {
  await runNightlyBackup();
  return { ok: true };
};`,
    py: `# GCP Cloud Scheduler → HTTP Cloud Function
import functions_framework

@functions_framework.http
def nightly(request):
    run_nightly_backup()
    return "ok"`,
  }),
  relatedConcepts: ['Compute.Worker', 'Compute.ServerlessFunction'],
};
