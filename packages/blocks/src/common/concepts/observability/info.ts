import type { InfoContent } from '../_shared/types';

export const observabilityInfo: InfoContent = {
  overview: {
    markdown: `
# Observability

A single block that does two things at once:

1. **At deploy time** it provisions a cloud-native logging sink — Cloud
   Logging on GCP, CloudWatch on AWS, Monitor on Azure — so every
   connected service streams its logs there.
2. **On the canvas** it doubles as a live log terminal. Once a connected
   service is deployed, the block tails its runtime logs in real time,
   right inside the block.

> Live tailing on the canvas is currently **GCP only**. AWS and Azure
> sinks still deploy and collect logs; live-tail UI for those providers
> is on the roadmap.

## Connecting

Draw an edge from any compute or database block into the Observability
block, and the runtime tails that service. Supported sources:

- **Compute** — Scalable Backend, SSR Site, Worker, Serverless Function
  (Cloud Functions v2)
- **Database** — Postgres, MySQL, Redis, MongoDB

## Streaming modes

Selectable from the properties panel:

- **Polling** (default) — refreshes every 2 seconds via Cloud Logging's
  \`entries.list\`. Cheap and quota-friendly.
- **Tail** — sub-second streaming via the gRPC \`tailLogEntries\` API.
  More expensive; opt in when you need it.

## Permissions

The deploy service account must have at least \`roles/logging.viewer\`.
Without it, the panel surfaces a clear error instead of silently
returning empty results.

## Caveats

- **Cloud Functions v1 (legacy)** — not supported. Only v2 functions
  emit to Cloud Logging in a tailable shape.
- **Static Site** — not supported. Firebase Hosting v1 emits no Cloud
  Logging output, so there's nothing to tail.
- **MongoDB on GCE** — only host-level VM logs are available. The
  MongoDB process itself does not emit to Cloud Logging.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'CloudWatch Log Group', type: 'aws_cloudwatch_log_group' },
      { name: 'CloudWatch Alarm', type: 'aws_cloudwatch_metric_alarm', optional: true },
    ],
    gcp: [
      { name: 'Logging Sink', type: 'google_logging_project_sink' },
      { name: 'Monitoring Alert Policy', type: 'google_monitoring_alert_policy', optional: true },
    ],
    azure: [
      { name: 'Log Analytics Workspace', type: 'azurerm_log_analytics_workspace' },
      { name: 'Application Insights', type: 'azurerm_application_insights' },
    ],
  },
  relatedConcepts: [
    'Compute.Container',
    'Compute.SSRSite',
    'Compute.ServerlessFunction',
    'Compute.Worker',
    'Database.PostgreSQL',
    'Database.MySQL',
    'Database.Redis',
    'Database.MongoDB',
  ],
};
