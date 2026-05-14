# Community Edition

> [!IMPORTANT]
> **Single-user, trusted-machine deployment.** No multi-tenant isolation, no RBAC enforcement, no audit log. Run on your laptop, your own VM, or your own VPC - not as a shared hosted service. Multi-user / RBAC live in the Cloud edition (see ["What ICE Cloud adds"](#what-ice-cloud-hosted-adds) below). Full threat model in [SECURITY.md](../SECURITY.md).

The software in this repository **is** ICE. The whole thing - canvas, engine, deploy providers, AI, templates, desktop app - is released under Apache 2.0 and is the same code-base that powers ICE Cloud (see below).

There is no separate "community" fork with features stripped out. "Community Edition" here just refers to the self-hosted deployment mode of the open-source code, as distinct from the managed hosted service.

## What you get self-hosting (this repo)

Everything:

- Visual canvas, properties panel, graph engine.
- 20+ GCP deploy handlers (Cloud Run, Cloud SQL, Cloud Storage, Pub/Sub, Firestore, BigQuery, Vertex AI, etc.) plus AWS/Azure deployers.
- 45+ GCP importers.
- Pipelines + GitHub webhooks + environment presets.
- AI assistant (if you supply an `ANTHROPIC_API_KEY`).
- All templates.
- Electron desktop app with embedded backend + SQLite.
- i18n (English, Mandarin).

## What ICE Cloud (hosted) adds

ICE Cloud is a separate, commercial hosted service operated by the project maintainers. It runs the same open-source code as this repository, plus operational layers that only make sense in a hosted context:

- Always-on gateway + managed Postgres.
- Shared team state (multi-user, RBAC, audit logs - some of which live in a proprietary module).
- Zero-config AI (no Anthropic key needed).
- SSO / SAML for paid tiers.
- Managed deploy plane with drift monitoring.
- Compliance packaging (SOC 2 / HIPAA) for enterprise tiers.

Cloud is optional. If you want to self-host forever, that path is and will remain first-class.

## Current single-user assumption

Self-hosted deploys are currently designed for a single primary user (or a small trusted team). Where you see things like _"community edition is single-user - RBAC skipped here"_ in the backlog, that's what it refers to: the open-source self-hosted mode doesn't currently enforce multi-user authorisation boundaries, because there aren't any to enforce. If you run ICE exposed to multiple users, treat it as you would any pre-auth-hardened internal tool - behind a VPN or reverse proxy with its own auth.

Multi-user and full RBAC are Cloud-first features; once they're ready there, the self-hostable subset will be upstreamed into this repository.

## Getting started

See the repo root [README.md](../README.md) for install and run instructions.
