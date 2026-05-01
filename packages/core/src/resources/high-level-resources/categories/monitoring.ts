/**
 * High-level resource category: MONITORING.
 *
 * Logs, metrics, alerts, dashboards, and tracing.
 *
 * Sized at ~190 LOC of literal data, well within the 500-LOC ceiling.
 * Split out for symmetry with the rest of the categories sub-tree
 * (one file per category) — see `../../high-level-resources.ts` for the
 * rationale of the rf-hlres split.
 *
 * The exported `monitoring: HighLevelCategory` is consumed by `../high-level-resources.ts`
 * which assembles it into `HIGH_LEVEL_CATEGORIES`. The shape and content are
 * byte-identical to what was previously inlined there.
 */

// `NodeBehavior` is imported because the data literal uses `behavior: '...' as NodeBehavior` casts.
import type { HighLevelCategory, NodeBehavior } from '../types.js';
export type { NodeBehavior };

export const monitoring: HighLevelCategory = 
  {
    id: 'monitoring',
    name: 'Monitoring',
    description: 'Logs, metrics, and alerts',
    icon: 'Activity',
    resources: [
      {
        id: 'log-group',
        name: 'Log Group',
        description: 'Centralized application logging with real-time streaming',
        icon: 'FileText',
        category: 'monitoring',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudwatch:LogGroup',
            display_name: 'CloudWatch Logs',
          },
          { provider: 'gcp', resource_type: 'gcp:logging:Sink', display_name: 'Cloud Logging' },
          {
            provider: 'azure',
            resource_type: 'azure:operationalinsights:Workspace',
            display_name: 'Log Analytics',
          },
        ],
        keywords: ['log', 'cloudwatch', 'logging', 'stackdriver'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this log group',
            placeholder: 'My Logs',
          },
          {
            name: 'keep_logs',
            label: 'How long to keep logs?',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'Older logs are automatically deleted to save costs',
            options: ['7 days', '14 days', '30 days', '90 days', '1 year', 'Keep forever'],
            default: '30 days',
          },
          {
            name: 'sources',
            label: 'Which services send logs here?',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Services that should write to this log group',
            placeholder: 'e.g. backend-api',
            addLabel: 'Add a source',
          },
        ],
      },
      {
        id: 'alert',
        name: 'Alert',
        description: 'Get notified when things go wrong',
        icon: 'Bell',
        category: 'monitoring',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudwatch:MetricAlarm',
            display_name: 'CloudWatch Alarm',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:monitoring:AlertPolicy',
            display_name: 'Cloud Monitoring Alert',
          },
          {
            provider: 'azure',
            resource_type: 'azure:monitor:MetricAlert',
            display_name: 'Azure Monitor Alert',
          },
        ],
        keywords: ['alarm', 'alert', 'cloudwatch', 'notification', 'pagerduty'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this alert',
            placeholder: 'My Alert',
          },
          {
            name: 'watch_for',
            label: 'What should trigger this alert?',
            type: 'select',
            required: true,
            tier: 'essential',
            description: 'Pick what you want to be notified about',
            options: [
              'Service is down',
              'Too many errors',
              'Service is slow',
              'Running out of storage',
              'High resource usage',
              'Custom condition',
            ],
            default: 'Too many errors',
          },
          {
            name: 'severity',
            label: 'How urgent?',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'How urgently should you be notified?',
            options: ['Low — check when convenient', 'Medium — look into it soon', 'High — wake me up at 3am'],
            default: 'Medium — look into it soon',
          },
          {
            name: 'notify',
            label: 'Who to notify?',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Email addresses or channels to notify',
            placeholder: 'e.g. team@example.com',
            addLabel: 'Add a recipient',
          },
        ],
      },
      {
        id: 'dashboard',
        name: 'Dashboard',
        description: 'Visualize your infrastructure metrics',
        icon: 'BarChart',
        category: 'monitoring',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudwatch:Dashboard',
            display_name: 'CloudWatch Dashboard',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:monitoring:Dashboard',
            display_name: 'Cloud Monitoring Dashboard',
          },
          {
            provider: 'azure',
            resource_type: 'azure:portal:Dashboard',
            display_name: 'Azure Dashboard',
          },
        ],
        keywords: ['dashboard', 'grafana', 'cloudwatch', 'metrics', 'datadog'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this dashboard',
            placeholder: 'My Dashboard',
          },
          {
            name: 'services',
            label: 'Which services to monitor?',
            type: 'list',
            required: false,
            tier: 'essential',
            description: 'Add the services you want to see on this dashboard',
            placeholder: 'e.g. backend-api',
            addLabel: 'Add a service',
          },
        ],
      },
    ],
  };
