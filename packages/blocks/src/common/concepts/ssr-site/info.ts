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
    markdownZh: `
# SSR 站点

在容器中运行的服务端渲染 Web 应用。每个请求都由一个 Node/Bun/Deno 进程实时渲染 HTML —— 与提供预构建文件的静态站点正好相反。

## 适用场景

- 含动态数据的 **Next.js / Nuxt / SvelteKit / Remix**
- 个性化内容、需鉴权的页面、服务端 A/B 测试
- 每次请求都要访问数据库或 API 的页面

## 不适用场景

- 完全静态的输出 → 改用 **静态站点**（更便宜、更快）
- 纯 API 服务 → 改用 **可扩展后端**
- 偶发或定时任务 → 改用 **无服务器函数** 或 **定时任务**

## 弹性伸缩

SSR 站点在空闲时可缩容到零（零成本），在高负载下可扩展到 N 个实例。若无法接受冷启动延迟，请设置 \`minInstances > 0\`。

## 连接方式

- 挂接 **自定义域名**，使用自己的主机名和 HTTPS。
- 连接到 **Postgres**、**Redis Cache**、**对象存储** 或 **密钥库** 以获取数据和配置。
- 放置在 **私有网络** 内，使其位于内部负载均衡器后方，与外网隔离。
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
  linksZh: ['Next.js 部署', 'Cloud Run 快速入门'],
  relatedConcepts: ['Compute.StaticSite', 'Compute.BackendAPI', 'Network.CustomDomain'],
};
