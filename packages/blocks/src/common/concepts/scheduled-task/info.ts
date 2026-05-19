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
    markdownZh: `
# 定时任务

cron 作业。按计划运行代码后退出。不是常驻服务 —— 每次计划触发时，服务商才会启动一次执行。

## 适用场景

- 每夜数据库备份
- 每小时数据导入
- 每周报表和摘要
- 清理脚本（删除旧上传、过期会话）

## 调度格式

标准 cron：\`分 时 日 月 周\`。示例：
- \`0 * * * *\` —— 每小时
- \`0 3 * * *\` —— 每天凌晨 3 点
- \`0 9 * * 1\` —— 每周一上午 9 点
- \`*/15 * * * *\` —— 每 15 分钟

## 连接方式

连接到 **Postgres** / **对象存储** / **密钥库** 以访问数据。通常以 **Worker** 或 **无服务器函数** 作为实际的作业主体。
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'EventBridge Rule', type: 'aws_cloudwatch_event_rule', role: 'cron trigger' },
      { name: 'Lambda Target', type: 'aws_cloudwatch_event_target' },
    ],
    gcp: [{ name: 'Cloud Scheduler Job', type: 'google_cloud_scheduler_job' }],
    azure: [{ name: 'Logic App / Function App timer', type: 'azurerm_linux_function_app', role: 'timer trigger' }],
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
