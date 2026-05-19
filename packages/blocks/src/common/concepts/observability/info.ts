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
    markdownZh: `
# 可观测性

一个块同时承担两件事：

1. **在部署时** 创建云原生日志接收端 —— GCP 上是 Cloud Logging，AWS 上是 CloudWatch，Azure 上是 Monitor —— 让每个相连服务都把日志流送到那里。
2. **在画布上** 它兼作实时日志终端。一旦相连服务部署完成，该块即可在自身内部实时跟随该服务的运行时日志。

> 画布上的实时跟随当前 **仅支持 GCP**。AWS 与 Azure 的日志接收端依然会被部署并收集日志；这两个云的实时跟随 UI 已在路线图上。

## 连接方式

从任意计算类或数据库类块向 **可观测性** 块拖一条边，运行时即可跟随该服务的日志。支持的来源：

- **计算** —— 可扩展后端、SSR 站点、Worker、无服务器函数（Cloud Functions v2）
- **数据库** —— Postgres、MySQL、Redis、MongoDB

## 流式模式

可在属性面板中选择：

- **轮询**（默认）—— 通过 Cloud Logging 的 \`entries.list\` 每 2 秒刷新一次。便宜且对配额友好。
- **Tail** —— 通过 gRPC 的 \`tailLogEntries\` API 实现亚秒级流式输出。开销更大；按需启用。

## 权限

部署用的服务账号至少需要 \`roles/logging.viewer\` 权限。否则该面板会显式报错，而不是悄无声息地返回空结果。

## 注意事项

- **Cloud Functions v1（旧版）** —— 不支持。只有 v2 函数会以可被跟随的形式输出到 Cloud Logging。
- **静态站点** —— 不支持。Firebase Hosting v1 不会向 Cloud Logging 输出任何内容，因此没有可跟随的日志。
- **GCE 上的 MongoDB** —— 仅能获取宿主级 VM 日志。MongoDB 进程本身不会向 Cloud Logging 输出。
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
