import { defineSnippets } from '../_shared/code-snippets';
import type { InfoContent } from '../_shared/types';

export const scalableBackendInfo: InfoContent = {
  overview: {
    markdown: `
# Scalable Backend

A long-running HTTP service that handles API requests. Runs in a container,
auto-scales on CPU load, sits behind a load balancer for HTTPS and health
checks.

## When to use

- REST / GraphQL / gRPC APIs
- WebSocket servers
- Any long-running request handler

## When NOT to use

- One-off event handlers → **Serverless Function**
- Background jobs that pull from a queue → **Worker**
- Cron jobs → **Scheduled Task**
- Pre-built static files → **Static Site**

## Scaling

Defaults to 1-10 instances, CPU-triggered. Set \`minInstances: 0\` for
scale-to-zero (cheaper, slower cold starts). Set \`minInstances: N\` for
always-warm.

## Connecting

Wire to **Postgres**, **Redis Cache**, **Object Storage**, **Secret Store**,
and **Message Queue**. Attach a **Custom Domain** to expose it publicly.
Place inside a **Private Network** to restrict ingress to an internal LB.
    `.trim(),
    markdownZh: `
# 可扩展后端

一个长期运行的 HTTP 服务，专门处理 API 请求。在容器中运行，按 CPU 负载自动伸缩，位于负载均衡器之后处理 HTTPS 和健康检查。

## 适用场景

- REST / GraphQL / gRPC API
- WebSocket 服务器
- 任何长耗时的请求处理器

## 不适用场景

- 一次性事件处理 → 改用 **无服务器函数**
- 从队列消费的后台作业 → 改用 **Worker**
- 定时任务 → 改用 **定时任务**
- 预构建的静态文件 → 改用 **静态站点**

## 弹性伸缩

默认 1-10 个实例，由 CPU 触发。设置 \`minInstances: 0\` 可缩容到零（更便宜，但冷启动较慢）。设置 \`minInstances: N\` 可保持常驻热实例。

## 连接方式

连接到 **Postgres**、**Redis Cache**、**对象存储**、**密钥库** 和 **消息队列**。挂接 **自定义域名** 对外暴露。放置在 **私有网络** 内可将入口限制为内部负载均衡器。
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'ECS Fargate Service', type: 'aws_ecs_service' },
      { name: 'Application Load Balancer', type: 'aws_lb' },
      { name: 'Target Group', type: 'aws_lb_target_group' },
      { name: 'Task Definition', type: 'aws_ecs_task_definition' },
    ],
    gcp: [{ name: 'Cloud Run Service', type: 'google_cloud_run_v2_service' }],
    azure: [
      { name: 'Container App', type: 'azurerm_container_app' },
      { name: 'Container App Environment', type: 'azurerm_container_app_environment' },
    ],
    kubernetes: [
      { name: 'Deployment', type: 'kubernetes_deployment_v1' },
      { name: 'Service', type: 'kubernetes_service_v1' },
      { name: 'Ingress', type: 'kubernetes_ingress_v1', optional: true },
    ],
  },
  snippets: defineSnippets({
    ts: `// Express.js HTTP server
import express from 'express';
const app = express();
app.get('/health', (_req, res) => res.send('ok'));
app.get('/api/users', async (_req, res) => {
  res.json({ users: [] });
});
app.listen(8080);`,
    py: `# FastAPI HTTP server
from fastapi import FastAPI
app = FastAPI()

@app.get("/health")
def health(): return "ok"

@app.get("/api/users")
async def list_users():
    return {"users": []}`,
    go: `package main
import (
    "encoding/json"
    "net/http"
)
func main() {
    http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("ok"))
    })
    http.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
        json.NewEncoder(w).Encode(map[string][]string{"users": {}})
    })
    http.ListenAndServe(":8080", nil)
}`,
  }),
  links: [
    { label: 'Cloud Run', url: 'https://cloud.google.com/run' },
    { label: 'AWS ECS', url: 'https://docs.aws.amazon.com/ecs/' },
    { label: 'Azure Container Apps', url: 'https://learn.microsoft.com/azure/container-apps/' },
  ],
  linksZh: ['Cloud Run', 'AWS ECS', 'Azure Container Apps'],
  relatedConcepts: ['Compute.SSRSite', 'Compute.ServerlessFunction', 'Compute.Worker', 'Network.CustomDomain'],
};
