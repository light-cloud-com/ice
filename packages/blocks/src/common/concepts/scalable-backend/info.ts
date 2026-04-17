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
  },
  compilesTo: {
    aws: [
      { name: 'ECS Fargate Service', type: 'aws_ecs_service' },
      { name: 'Application Load Balancer', type: 'aws_lb' },
      { name: 'Target Group', type: 'aws_lb_target_group' },
      { name: 'Task Definition', type: 'aws_ecs_task_definition' },
    ],
    gcp: [
      { name: 'Cloud Run Service', type: 'google_cloud_run_v2_service' },
    ],
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
  relatedConcepts: ['Compute.SSRSite', 'Compute.ServerlessFunction', 'Compute.Worker', 'Network.CustomDomain'],
};
