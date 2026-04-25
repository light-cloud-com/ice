import { defineSnippets } from '../_shared/code-snippets';
import type { InfoContent } from '../_shared/types';

export const ssrSiteInfo: InfoContent = {
  overview: {
    markdown: `
# SSR Site

A server-rendered web app running in a container. Every request is handled by
a Node/Bun/Deno process that renders HTML on the fly — the opposite of a
Static Site, which serves pre-built files.

## When to use

- **Next.js / Nuxt / SvelteKit / Remix** with dynamic data
- Personalized content, auth-gated pages, A/B tests server-side
- Pages that hit your database or an API on every request

## When NOT to use

- Fully static output → use **Static Site** (cheaper, faster)
- API-only service → use **Scalable Backend**
- Rare or scheduled work → use **Serverless Function** or **Scheduled Task**

## Scaling

SSR Sites scale to zero when idle (free) and up to N instances under load.
Set \`minInstances > 0\` if cold starts are unacceptable.

## Connecting

- Attach **Custom Domain** for your own hostname with HTTPS.
- Wire to **Postgres**, **Redis Cache**, **Object Storage**, or **Secret Store**
  for data and config.
- Place inside a **Private Network** to seal it behind an internal LB.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'ECS Fargate Service', type: 'aws_ecs_service', role: 'container runtime' },
      { name: 'Application Load Balancer', type: 'aws_lb', role: 'HTTPS ingress' },
      { name: 'Task Definition', type: 'aws_ecs_task_definition' },
      { name: 'CloudWatch Log Group', type: 'aws_cloudwatch_log_group', optional: true },
    ],
    gcp: [{ name: 'Cloud Run Service', type: 'google_cloud_run_v2_service', role: 'container runtime + HTTPS' }],
    azure: [
      { name: 'Container App', type: 'azurerm_container_app', role: 'container runtime + HTTPS' },
      { name: 'Container App Environment', type: 'azurerm_container_app_environment' },
    ],
  },
  snippets: defineSnippets({
    ts: `// Next.js App Router — runs on the server per request
// app/page.tsx
export default async function Page() {
  const res = await fetch('https://api.example.com/data', { cache: 'no-store' });
  const data = await res.json();
  return <main>{data.title}</main>;
}`,
    py: `# FastAPI SSR with Jinja2
from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates
app = FastAPI()
templates = Jinja2Templates(directory="templates")

@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "title": "Hi"})`,
    go: `package main
import (
    "html/template"
    "net/http"
)
var tpl = template.Must(template.ParseFiles("index.html"))
func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        tpl.Execute(w, map[string]string{"Title": "Hi"})
    })
    http.ListenAndServe(":3000", nil)
}`,
  }),
  links: [
    { label: 'Next.js deployment', url: 'https://nextjs.org/docs/app/building-your-application/deploying' },
    { label: 'Cloud Run quickstart', url: 'https://cloud.google.com/run/docs/quickstarts' },
  ],
  relatedConcepts: ['Compute.StaticSite', 'Compute.BackendAPI', 'Network.CustomDomain'],
};
