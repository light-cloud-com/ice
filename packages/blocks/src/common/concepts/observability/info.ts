import type { InfoContent } from '../_shared/types';

export const observabilityInfo: InfoContent = {
  overview: {
    markdown: `
# Observability

A single block covering logs, metrics, and alerts for your stack. One
Observability block per project is usually enough — wire your services
to it and they'll stream logs + metrics automatically.

## What it includes

- **Log aggregation** — collect from all services
- **Metrics dashboards** — CPU, memory, request rate, latency
- **Alerts** — notify on error rate spikes, high latency, missing signals

## Connecting

Wire any compute block (**Scalable Backend**, **Worker**, **Serverless Function**,
**SSR Site**) to Observability to route its logs + metrics here. Attach a
**Log Terminal** to tail logs live on the canvas.
    `.trim(),
  },
  compilesTo: {
    aws: [{ name: 'CloudWatch Log Group', type: 'aws_cloudwatch_log_group' }, { name: 'CloudWatch Alarm', type: 'aws_cloudwatch_metric_alarm', optional: true }],
    gcp: [{ name: 'Logging Sink', type: 'google_logging_project_sink' }, { name: 'Monitoring Alert Policy', type: 'google_monitoring_alert_policy', optional: true }],
    azure: [{ name: 'Log Analytics Workspace', type: 'azurerm_log_analytics_workspace' }, { name: 'Application Insights', type: 'azurerm_application_insights' }],
  },
  relatedConcepts: ['Monitoring.Terminal', 'Compute.Container'],
};
