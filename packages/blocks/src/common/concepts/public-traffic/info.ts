import type { InfoContent } from '../_shared/types';

export const publicTrafficInfo: InfoContent = {
  overview: {
    markdown: `
# Public Traffic

A **canvas-only** symbolic source node representing the internet and the
users arriving from it. Think of it as the "cloud labeled Users" icon
from architecture diagrams — it makes the public ingress path explicit.

## What it does

Draw an edge FROM Public Traffic TO any public-facing block (**Static Site**,
**SSR Site**, **Scalable Backend**, **API Gateway**, **Custom Domain**) to
document "users arrive from the internet and hit this service first."

## What it doesn't do

This block is purely documentation. It does not provision a load balancer,
DNS, or WAF. It does not log requests. It does not compile to any cloud
resource. It exists to keep your diagram legible.

If you want HTTPS + a real public entry point, use **Custom Domain**. If you
want centralized request management, use **API Gateway**. Public Traffic is
the *concept* of "the outside world," not a gateway.
    `.trim(),
  },
  compilesTo: {
    // Intentionally empty — canvas-only block, no infra emitted.
  },
  relatedConcepts: ['Network.CustomDomain', 'Network.APIGateway', 'Compute.StaticSite', 'Compute.SSRSite'],
};
