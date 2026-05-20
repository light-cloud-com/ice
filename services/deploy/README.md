# @ice/service-deploy

The plan/apply orchestrator. Owns the deploy queue, the GitHub webhook → pipeline flow, the destroy path, and the cron jobs that poll long-running cloud operations.

Where to start reading:

- `src/routes/deploy.ts` — HTTP surface (plan, apply, destroy, status).
- `src/services/apply-deployment.ts` — the apply pipeline.
- `src/services/destroy-deployment.ts` — the symmetric destroy path.
- `src/services/queue.service.ts` — BullMQ queue (Redis) or the in-memory fallback for desktop.
- `src/services/gcp-api-enabler.ts` — auto-enables required GCP APIs from the canvas's resource types before deploying.
- `src/services/pipeline/github-webhooks.ts` — HMAC-verified webhook handler that triggers deploys on push.

Verbose debug logs are gated behind `DEBUG=ice:deploy`.
