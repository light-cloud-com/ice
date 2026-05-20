import { defineSnippets } from '../_shared/code-snippets';
import type { InfoContent } from '../_shared/types';

export const serverlessFunctionInfo: InfoContent = {
  overview: {
    markdown: `
# Serverless Function

A short-lived function that runs in response to an event. Scales to zero when
idle (no cost), spins up on demand. Typical execution: under 30 seconds.

## When to use

- Webhook handlers (Stripe, GitHub, Slack)
- Image/video processing on upload
- Light API endpoints you don't want to keep warm
- Fan-out work from a queue or pub/sub

## When NOT to use

- Long-running requests (>60s) → **Scalable Backend** or **Worker**
- Continuous background processing → **Worker**
- Cold starts unacceptable → **Scalable Backend** with \`minInstances: 1\`

## Triggers

HTTP, pub/sub, object storage events, scheduled (cron), database changes.
Set via the \`trigger\` prop.
    `.trim(),
    markdownZh: `
# 无服务器函数

为响应事件而运行的短生命周期函数。空闲时缩容到零（零成本），按需即时启动。典型执行时长：30 秒以内。

## 适用场景

- Webhook 处理器（Stripe、GitHub、Slack）
- 文件上传后的图片/视频处理
- 不需要保持热启动的轻量 API 端点
- 从队列或 pub/sub 扇出的工作

## 不适用场景

- 长耗时请求（>60 秒）→ 改用 **可扩展后端** 或 **Worker**
- 持续运行的后台处理 → 改用 **Worker**
- 无法接受冷启动 → 使用 **可扩展后端** 并设置 \`minInstances: 1\`

## 触发器

HTTP、pub/sub、对象存储事件、定时（cron）、数据库变更。通过 \`trigger\` 属性进行设置。
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'Lambda Function', type: 'aws_lambda_function' },
      { name: 'IAM Role', type: 'aws_iam_role' },
      { name: 'API Gateway (if HTTP)', type: 'aws_apigatewayv2_api', optional: true },
    ],
    gcp: [{ name: 'Cloud Function', type: 'google_cloudfunctions2_function' }],
    azure: [
      { name: 'Function App', type: 'azurerm_linux_function_app' },
      { name: 'App Service Plan', type: 'azurerm_service_plan' },
    ],
  },
  snippets: defineSnippets({
    ts: `// AWS Lambda handler
export const handler = async (event: any) => {
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};`,
    py: `# GCP Cloud Function
import functions_framework

@functions_framework.http
def hello(request):
    return {"ok": True}`,
    go: `package function
import (
    "encoding/json"
    "net/http"
)
func Handler(w http.ResponseWriter, r *http.Request) {
    json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}`,
  }),
  links: [
    { label: 'AWS Lambda', url: 'https://docs.aws.amazon.com/lambda/' },
    { label: 'GCP Cloud Functions', url: 'https://cloud.google.com/functions/docs' },
  ],
  linksZh: ['AWS Lambda', 'GCP Cloud Functions'],
  relatedConcepts: ['Compute.Container', 'Compute.Worker', 'Messaging.MessageQueue'],
};
