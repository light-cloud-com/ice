import type { InfoContent } from '../_shared/types';

export const githubRepoInfo: InfoContent = {
  overview: {
    markdown: `
# GitHub Repository

A link to a GitHub repository as the source of code for deployment. Wire
connections from a GitHub Repo block to any compute block (**Static Site**,
**SSR Site**, **Scalable Backend**, etc.) to say "this service is deployed
from that repo".

Does not provision any cloud resource — it's a source-of-truth pointer
used by the deploy pipeline to find your code.
    `.trim(),
    markdownZh: `
# GitHub 仓库

指向一个 GitHub 仓库的链接，作为部署时的代码来源。从 GitHub 仓库块拖一条连接到任意计算类块（**静态站点**、**SSR 站点**、**可扩展后端** 等），即可表达"该服务从此仓库部署"。

不会创建任何云资源 —— 它只是一个权威指针，供部署流水线用来定位你的代码。
    `.trim(),
  },
  relatedConcepts: ['Compute.StaticSite', 'Compute.SSRSite', 'Compute.Container'],
};
