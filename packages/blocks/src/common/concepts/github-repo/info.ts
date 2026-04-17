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
  },
  relatedConcepts: ['Compute.StaticSite', 'Compute.SSRSite', 'Compute.Container'],
};
