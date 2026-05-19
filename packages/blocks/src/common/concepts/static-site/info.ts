/**
 * Static Site — Info (i) panel content
 */

import { defineSnippets } from '../_shared/code-snippets';
import type { InfoContent } from '../_shared/types';

export const staticSiteInfo: InfoContent = {
  overview: {
    markdown: `
# Static Site

A frontend app served from object storage behind a CDN. No server to run,
no container to manage — you ship a build directory and the cloud provider
handles HTTPS, caching, and global distribution.

## When to use

- Single-page apps (React, Vue, Svelte, Solid)
- Static site generators (Astro, Hugo, Jekyll, Eleventy)
- Pre-rendered Next.js / Nuxt / SvelteKit output
- Marketing sites, docs, landing pages, portfolios

## When NOT to use

- You need server-side rendering per request → use **SSR Site**
- You need API endpoints → use **Scalable Backend** or **Serverless Function**
- Content changes per-user at request time → use **SSR Site**

## Connecting

- Attach a **Custom Domain** to expose the site on your own hostname with HTTPS.
- Drop **Public Traffic** on the canvas pointing into this block to make the
  "users arrive from the internet" edge explicit in your diagram.
- Wire it to a **Scalable Backend** or **API Gateway** if the frontend calls
  your own API.
    `.trim(),
    markdownZh: `
# 静态站点

一个由对象存储托管、CDN 加速的前端应用。无需运行服务器，无需管理容器 —— 你只需上传构建目录，云服务商即可处理 HTTPS、缓存和全球分发。

## 适用场景

- 单页应用（React、Vue、Svelte、Solid）
- 静态站点生成器（Astro、Hugo、Jekyll、Eleventy）
- 预渲染的 Next.js / Nuxt / SvelteKit 输出
- 营销网站、文档站、落地页、作品集

## 不适用场景

- 每个请求都需要服务端渲染 → 改用 **SSR 站点**
- 需要 API 端点 → 改用 **可扩展后端** 或 **无服务器函数**
- 内容随用户在请求时动态变化 → 改用 **SSR 站点**

## 连接方式

- 挂接 **自定义域名** 即可用自己的主机名 + HTTPS 对外暴露该站点。
- 在画布上放置 **公网流量** 节点并指向此块，让"用户从互联网到达"的入口路径在架构图中一目了然。
- 如果前端调用自己的 API，将其连接到 **可扩展后端** 或 **API Gateway**。
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'S3 Bucket', type: 'aws_s3_bucket', role: 'static file hosting' },
      { name: 'S3 Website Configuration', type: 'aws_s3_bucket_website_configuration' },
      { name: 'CloudFront Distribution', type: 'aws_cloudfront_distribution', role: 'CDN + HTTPS' },
      { name: 'Origin Access Identity', type: 'aws_cloudfront_origin_access_identity' },
    ],
    gcp: [
      { name: 'Firebase Hosting Site', type: 'google_firebase_hosting_site', role: 'CDN + HTTPS' },
      { name: 'Firebase Hosting Version', type: 'google_firebase_hosting_version', role: 'content version' },
      { name: 'Firebase Hosting Release', type: 'google_firebase_hosting_release', role: 'live release' },
    ],
    azure: [{ name: 'Static Web App', type: 'azurerm_static_web_app', role: 'CDN + HTTPS + build pipeline' }],
  },
  snippets: defineSnippets({
    ts: `// Fetch data from a paired Scalable Backend
const res = await fetch('/api/users');
const users = await res.json();`,
    py: `# Python build step (example: pre-render with a generator)
# Run this in your CI to produce the 'dist/' directory
import subprocess
subprocess.run(['npm', 'run', 'build'], check=True)`,
    go: `// Go is unusual for static sites — typically used in the build step
// e.g. Hugo or a custom generator producing ./public
package main
import "os/exec"
func main() { _ = exec.Command("hugo", "--minify").Run() }`,
    java: `// Java is rare for static sites; you'd typically use it in a CI build
// to invoke a JS toolchain that produces the output directory.
ProcessBuilder pb = new ProcessBuilder("npm", "run", "build");
pb.inheritIO().start().waitFor();`,
    csharp: `// Blazor WebAssembly apps compile to a static bundle
// that deploys cleanly as a Static Site.
using var proc = System.Diagnostics.Process.Start("dotnet", "publish -c Release");
proc?.WaitForExit();`,
    rust: `// Rust + Trunk or Leptos compiles to a static WASM+HTML bundle
use std::process::Command;
Command::new("trunk").arg("build").arg("--release").status().unwrap();`,
  }),
  links: [
    {
      label: 'AWS — S3 static website hosting',
      url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html',
    },
    { label: 'GCP — Firebase Hosting', url: 'https://firebase.google.com/docs/hosting' },
    { label: 'Azure — Static Web Apps', url: 'https://learn.microsoft.com/azure/static-web-apps/' },
  ],
  linksZh: ['AWS — S3 静态网站托管', 'GCP — Firebase Hosting', 'Azure — Static Web Apps'],
  relatedConcepts: ['Compute.SSRSite', 'Network.CustomDomain', 'Network.PublicTraffic', 'Compute.BackendAPI'],
};
