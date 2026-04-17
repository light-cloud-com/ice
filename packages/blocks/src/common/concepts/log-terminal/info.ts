import type { InfoContent } from '../_shared/types';

export const logTerminalInfo: InfoContent = {
  overview: {
    markdown: `
# Log Terminal

A **canvas-only** block — it does not provision any infrastructure. It's a
live log viewer that streams logs from a connected service and renders them
inside the block on the canvas.

## Connecting

Draw an edge FROM any compute block (**Scalable Backend**, **Worker**,
**Serverless Function**, **Scheduled Task**, **SSR Site**) or from an
**Observability** block TO a Log Terminal. The connection carries the log
source identifier so the runtime knows what to tail.

## No infrastructure

This block emits zero Terraform/Pulumi resources. It's a design- and
operations-time affordance for quickly inspecting service output without
leaving the canvas.
    `.trim(),
  },
  compilesTo: {
    // Intentionally empty — canvas-only block, no infra emitted.
  },
  relatedConcepts: ['Monitoring.Observability', 'Compute.Container'],
};
