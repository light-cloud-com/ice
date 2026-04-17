import type { InfoContent } from '../_shared/types';

export const envConfigInfo: InfoContent = {
  overview: {
    markdown: `
# Env Config

A bag of environment variables that get injected into every connected
compute block at deploy time. Drop one on the canvas, wire it to a
**Scalable Backend** / **SSR Site** / **Worker** / **Serverless Function**,
and the variables show up as \`process.env.*\` in your code.

## What goes here

- Non-sensitive config (feature flags, external API base URLs, log levels)
- Public tokens and identifiers
- Runtime-tunable values that aren't secret

## What does NOT go here

- Passwords, API keys, signing keys → use **Secret Store**
- Database URLs for connected databases — ICE wires those automatically
- Values that should rotate on a schedule → **Secret Store** with rotation
    `.trim(),
  },
  // Env Config does not compile to a cloud resource — it's a design-time
  // bundle of key-value pairs that the deploy pipeline injects into the
  // environment of connected compute blocks.
  compilesTo: {},
  relatedConcepts: ['Security.Secret', 'Compute.Container', 'Compute.SSRSite', 'Compute.ServerlessFunction'],
};
