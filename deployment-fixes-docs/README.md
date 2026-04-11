# ICE Deployment System — Fix Plan

This folder contains a phased remediation plan for the ICE deployment system, covering every issue surfaced during the April 2026 deep-dive investigation.

## What this is

A concrete, executable plan — not a vision document. Every phase lists file paths, specific changes, acceptance criteria, and dependencies on other phases. You should be able to hand a phase to yourself or a collaborator and land it without re-reading this entire folder.

## What this is not

- A marketing roadmap. Scope is "fix what's broken and close the known gaps."
- A rewrite. Every phase edits existing code in place; no greenfield rebuilds.
- A commitment. Phases are independent enough that you can reorder, postpone, or skip any of them based on actual priorities.

## The phases at a glance

| # | Phase | Effort | Ships what | Unblocks |
|---|---|---|---|---|
| 0 | [Critical Safety & Concurrency](./phase-0-critical-safety.md) | 1–2 days | Secret hygiene, per-card deploy lock, destroy dependency order, cycle detection, stuck-deploy watchdog | Everything else runs on a safe foundation |
| 1 | [Stable Resource Identity](./phase-1-stable-identity.md) | 2–3 days | Persisted `node_id → resource_name` mapping, partial-success state, standard labels | Updates instead of recreates (user's #3 and #4) |
| 2 | [Progress Visibility & Block Feedback](./phase-2-progress-feedback.md) | 2–3 days | Sub-step progress events, canvas block status/outputs, projects panel indicator, completion notifications | User's #1, #2, #5 |
| 3 | [Plan Quality & Preflight](./phase-3-plan-preflight.md) | 2–3 days | Plan-id binding, property-level diffs, preflight framework, error-to-remediation, retry wrapper | Users see problems before hitting Apply |
| 4 | [Block Requirements Framework](./phase-4-block-requirements.md) | 3–4 days | Requirements data model, GitHub repo and DNS requirements, post-deploy verification | DNS + GitHub repo feedback loop + extensibility |
| 5 | [Deploy UX & Multi-tenancy](./phase-5-ux-multitenancy.md) | 2–3 days | Per-card deploy state, cancellation, in-panel destroy modal, history view, retry-failed | Polish + foundation for real multi-card workflows |
| 6 | [Data Model Hardening](./phase-6-data-model.md) | 1–2 days | Foreign keys, schema versioning, retention policy, `(card_id, environment)` uniqueness | Correctness at scale, clean migrations |
| 7 | [Real Drift Detection](./phase-7-drift-detection.md) | 3–4 days | Per-resource-type GCP describe, real desired-vs-actual drift, accept/reset actions | Drift feature actually does what it says |
| 8 | [Custom Domains, DNS & Managed HTTPS](./phase-8-custom-domains-https.md) | 6–8 days | New CustomDomain block, managed SSL certs, backend bucket wiring, DNS/verification/cert requirements UI, updated static-site template | End-to-end "deploy a static site at my own domain with HTTPS" |
| 9 | [Resilience, Cleanup & Provider-Agnostic Prep](./phase-9-resilience-cleanup-provider-agnostic.md) | 1 day shipped + ongoing | Quota-aware error handling, orphan cleanup service, destroy-all for partial-failure recovery, Site Verification API auto-enable, cross-tab deploy visibility, bucket public access, Artifact Registry cleanup, axios error surfacing, docs of GCP-specific code for provider-agnostic refactor | Real-world deploys stop failing silently; GCP-specific touchpoints catalogued |

**Total estimated effort:** 23–33 engineer-days, assuming one engineer familiar with the codebase. Parallelizable to ~12 calendar days with two engineers if Phase 0 ships first and Phases 2 and 4 run in parallel with 1, 3, 5, 6.

## How to use this plan

**Before starting anything:** Read [00-inventory.md](./00-inventory.md). It lists every issue we found, with severity and cross-references into the phase files. If you disagree with how something is classified, fix the inventory before fixing the code.

**When you pick up a phase:**

1. Read the phase's "Overview" and "Issues addressed" sections to confirm scope.
2. Read "Dependencies" — if a prior phase hasn't shipped, either ship it first or document the workaround.
3. Walk the "Steps" in order. Each step has a filename, a concrete change, and an acceptance check.
4. Run the acceptance checks before moving on. They're designed to be small enough to verify without a full e2e run.
5. Update the phase file with anything you discover that changes the plan — this folder is a living document.

**When you finish a phase:**

1. Mark every step complete in the phase file.
2. Add a "Post-mortem" section at the bottom describing what was harder than expected, what was easier, and what's still outstanding.
3. Update the inventory — move the addressed items to a "✓ Fixed" section with a pointer to the PR.

## Sequencing recommendations

**Strictly sequential (Phase 0 must land first).** The concurrency and secret-handling fixes in Phase 0 are prerequisites for anything else to be safe in production. Don't skip it.

**Phase 1 should land before Phase 2 and Phase 4.** Stable resource identity is the foundation for per-block status display and for requirement verification. Without it, both of those features misattribute results.

**Phases 2, 3, 4 can run in parallel** once Phase 1 is done. They touch different areas (UI progress, plan preview, requirements framework) and their conflicts are minor and mergeable.

**Phase 5 should land after 2 and 4** because it reuses the block-status concept from Phase 2 and the requirement-unmet signal from Phase 4.

**Phase 6 can run in parallel with any other phase** except Phase 0. It's a schema migration, so it just needs careful sequencing with database deploys, not with code deploys.

**Phase 7 should land last among the original seven** because it depends on standard labels from Phase 1 and on the drift UI patterns that Phase 5 establishes.

**Phase 8 is additive** — it completes Phase 4's deferred UI work (requirements panel in the deploy panel + block properties panel) AND adds the missing infrastructure (backend bucket, managed SSL cert handler, domain verification). It can ship after Phase 4's backend has been validated but doesn't strictly need Phases 5, 6, or 7 first. Schedule it based on product priority — if custom domains are a near-term user need, Phase 8 can jump the queue right after Phase 4.

**Phase 9 is a "while running in production" phase** — everything in it was discovered while actually deploying real templates against a real GCP project and hitting real-world failure modes (quota exhaustion, missing APIs, partial deploys, cross-tab invisibility, misleading success states). The items that shipped are already live; the deferred items are documented with concrete file references. Phase 9 is also the seed document for the provider-agnostic refactor: it catalogues every GCP-specific touchpoint that will need per-provider implementations when we extend to AWS / Azure / Kubernetes, so the refactor can be scoped from a single source of truth instead of grepping the codebase.

## What we're explicitly not doing

See [deferred.md](./deferred.md) for the full list. Short version: cost estimation, AI chat integration with errors, multi-environment parallel deploys, automatic DNS provisioning via Cloudflare/Route53, rollback UI, keyboard shortcuts, and several other things that are reasonable features but don't address an existing source of user pain.

## Source material

The issues in this plan come from:

1. A running conversation in April 2026 where the user identified five problems on the deploy panel.
2. Three parallel research agent passes investigating backend robustness, deploy UX, and the data model.
3. The live deploy test against `lc-ice` GCP project which hit a cascade of real bugs (TargetHttpsProxy cert error, stuck deploy panel, GitHub repo 403, etc.), several of which have already been fixed in `services/deploy/src/services/deploy.service.ts`, `packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts`, `packages/core/src/deploy/card-translator.ts`, `packages/ui/src/features/deploy/components/deploy-panel.tsx`, `packages/ui/src/store/slices/deploy-slice.ts`, `e2e/repos/github-repo-client.ts`, `e2e/repos/index.ts`, `e2e/dashboard/server.ts`, and `e2e/dashboard/index.html`.

Changes already shipped ahead of this plan are listed in [00-inventory.md](./00-inventory.md) under "✓ Already fixed" — they provide useful context but don't need re-doing.
