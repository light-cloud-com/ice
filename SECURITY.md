# Security Policy

_Last reviewed: 2026-04-24_

Thanks for helping keep ICE and its users safe. This page explains how to report a vulnerability and what to expect.

## Reporting a vulnerability

**Please do not open a public GitHub issue, PR, or discussion for a suspected vulnerability.**

Preferred — **private GitHub Security Advisory**:
[github.com/light-cloud-com/ice/security/advisories/new](https://github.com/light-cloud-com/ice/security/advisories/new)

Alternative — email **julia@light-cloud.com**.

In your report, include:

- A description of the issue and the affected component.
- Reproduction steps or a proof-of-concept.
- Your assessment of impact (who / what is at risk, under what conditions).
- Any suggested fix or mitigation.

### What to expect

- **Acknowledgement** — within 3 working days on a best-effort basis.
- **Triage + severity assessment** — within 7 working days.
- **Fix timeline** — driven by severity. Critical issues are prioritised; we'll share a target window once triage is done.
- **Coordinated disclosure** — please keep details private for up to **90 days** from acknowledgement, or until we've shipped a fix and given existing users a reasonable window to upgrade (whichever is sooner). We'll credit you in release notes if you want.

ICE is maintained by a small team. We do our best, but we won't pretend to an enterprise SLA we can't hold.

## Scope

**In scope:**

- Code in this repository (Community Edition — canvas, engine, providers, AI, templates, desktop app).
- The Electron desktop build produced from this repo.
- Published binaries once signed releases exist.

**Out of scope:**

- ICE Cloud (managed service) — report via the same channels above; mention "ICE Cloud" in the subject.
- Known items listed on [ROADMAP.md](ROADMAP.md) under Security and Desktop (e.g. unsigned binaries, hardcoded desktop credential key). These are tracked publicly.
- Issues in third-party dependencies that don't materially affect ICE — please report upstream and let us know.
- Anything requiring compromise of the host machine you run ICE on (local root, physical access, keyboard attackers).

## Supported versions

| Version         | Supported |
| --------------- | --------- |
| 0.1.x (current) | Yes       |
| Older than 0.1  | No        |

Security fixes land on the current minor line. Once 0.2 exists, 0.1 will move to best-effort.

## Important caveat: Community Edition is single-user

Community Edition (this repo) auto-seeds a local user on startup and **bypasses JWT validation** (`packages/shared/src/auth/middleware.ts`). It is designed to run on a trusted, single-user machine — a desktop app or a private self-host behind your own auth.

**Do not expose Community Edition to the public internet without your own auth layer in front of it** (VPN, reverse proxy with SSO, etc.). Multi-user authorisation is planned for Team Edition — see [ROADMAP.md](ROADMAP.md).

## Security measures in the code

Verifiable from the source today:

- **Secrets required from env, no fallbacks.** `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` must be set; the gateway refuses to start otherwise.
- **Credentials encrypted at rest** with AES-256-GCM (`packages/shared/src/crypto.ts`).
- **JWT access tokens expire after 1h**; refresh tokens are rotated and stored server-side with a `jti`.
- **Webhook HMAC verification** on GitHub, Stripe, and inbound CI webhooks.
- **Rate limiting** on every gateway route (`apps/gateway/src/index.ts`).
- **CORS** restricted to the configured `FRONTEND_URL`.
- **Helmet.js** security headers on all responses.
- **Electron hardening** — `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` on all windows; navigation locked to the embedded gateway origin.

## Hall of fame

If you report a valid issue and want public credit, we'll list you here (name / handle / link, your choice).

_(empty — be the first.)_
