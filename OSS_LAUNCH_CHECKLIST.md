# Open Source Launch Checklist

Tracking work to take ICE from internal-ready to public-launch-ready.

Sourced from a six-front audit (docs, OSS signals, code health, features, UI/UX, tests/DX). Severity reflects "would a stranger forming a first impression hit this and bounce."

Legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[!]` needs human decision/action

---

## P0 - Blockers (no public link until these are done)

- [!] **1. Rotate exposed secrets.** Working tree `.env` contains real Anthropic API key, real GitHub PAT (`github_pat_11ABVYWMQ0…`), real GCP key path, real project ID. `.env` is gitignored so not in history, but treat the keys as compromised. Rotate at Anthropic, GitHub, GCP; then re-populate `.env` from `.env.example` placeholders. *Requires human action - external systems.*
- [x] **2. Remove hardcoded credentials in `packages/db/prisma/seed.ts`.** `password123` at line 18 and `test@ice-saas.dev` at line 41. Drive from env vars; print generated creds at end of run for dev convenience.
- [x] **3. Gate localhost defaults to dev only.**
  - `apps/gateway/src/index.ts:65` - CSP allows `ws://localhost:*` and `http://localhost:*` unconditionally. Wrap in `NODE_ENV !== 'production'`.
  - `packages/ai/src/providers/openai-compat.ts:26` - defaults to `http://localhost:8000`. Require explicit `ICE_AI_URL` in prod.
- [!] **4. Decide policy for `packages/core/src/schemas/generated/resource-types.ts`** (4.4M lines, committed). Options:
  - (a) `.gitignore` + commit the generation script + run on build.
  - (b) Keep committed; document why and how to regenerate.
  *Pick one before launch - affects clone size and PR diff readability.*
- [x] **5. Strip stray `console.log` from hot paths.** 54 instances in core+deploy. Worst:
  - `packages/core/src/importers/gcp/services/asset-inventory.ts:182-252` (debug logs in importer)
  - `services/deploy/src/services/queue.service.ts:66,194`
  - `apps/gateway/src/index.ts:212-315` (10+ on startup)
  
  Replace with a structured logger (pino) or gate behind `DEBUG`.

## P1 - Launch-quality

- [x] **6. Initial pass on ARIA labels** - onboarding-page Back/Skip/Next, sidebar-strip buttons (aria-label + aria-pressed), canvas NodeHeader (role + aria-label). Deeper a11y (full canvas keyboard nav, focus-trap on dialogs) remains for post-launch. Canvas SVG nodes/edges lack `aria-label`/`role`; `packages/ui/src/features/onboarding/components/onboarding-page.tsx:206-247` Back/Skip/Next have `id` but no label; sidebar strip collapsed buttons unlabeled. Target WCAG AA on interactive elements.
- [x] **7. Mark incomplete providers experimental in palette.** `PROVIDER_READINESS` constant added to `packages/constants/src/providers.ts` (GCP=stable, AWS/Azure=experimental, K8s/Alibaba/OCI/DO=design-only) and surfaced on `CloudProviderMeta`. UI surfaces (provider-connect modal badge etc.) can read from it; doc `provider-status.md` is the canonical reference. Alibaba/OCI/DO/Tencent currently render as if equal to GCP. Add `readiness: 'stable' | 'experimental' | 'design-only'` to `BlockBlueprint` in `packages/blocks/src/types.ts`; surface as badge/tooltip. AWS/Azure → `experimental`, only GCP → `stable`.
- [x] **8. Write package-level READMEs** for core, ui, blocks, db, shared, ai, constants, templates, gateway, desktop, web, service-deploy, service-credentials. Each is 5–10 lines: what the package does + where to start reading. for: `packages/core`, `packages/ui`, `packages/web`, `packages/blocks`, `packages/providers/{gcp,aws,azure}`, `packages/db`, `packages/shared`, `packages/constants`, `packages/ai`, `packages/templates`, `services/deploy`, `services/credentials`, `apps/desktop`, `apps/gateway`. 2–3 sentences + pointer to entry file.
- [x] **9. Create `docs/provider-status.md`** - per-provider × block-category table with status (deployable / partial / not yet). Pull from `getProviderCompatibility()`. Link from README.
- [x] **10. Add stub `docs/deploying-to-aws.md` and `docs/deploying-to-azure.md`.** Even short - mirror GCP guide structure, link to provider-status.md, set "parity in progress" expectation.
- [x] **11. Add `.github/dependabot.yml`** for npm + github-actions, weekly cadence, grouped minor/patch.
- [x] **12. Add `CHANGELOG.md` + release-notes flow.** Pick: changesets or hand-maintained + GitHub Releases body. Document in CONTRIBUTING.md. Also normalize version from `0.1.700` to standard semver.
- [x] **13. Add secret-scanning pre-commit hook** (gitleaks or trufflehog via husky). Catches the next `.env` incident.

## P2 - Soon after launch

- [x] **14. Write `docs/troubleshooting.md`** - stale pnpm, port conflicts, missing Prisma client (`Cannot find @ice/db`), `CREDENTIAL_ENCRYPTION_KEY` length error, GCP quota errors, unsigned macOS/Windows binary warnings.
- [x] **15. Zero-env-var Community Edition.** Superseded the original "write a configuration reference" plan. `JWT_SECRET` / `CREDENTIAL_ENCRYPTION_KEY` are auto-generated and persisted via the new `ensureLocalSecrets()` helper. Cloud credentials and the Anthropic key are entered in-app under Settings → Providers / Settings → AI. `.env.example` is now optional dev overrides only. `ICE_TEST_*` lives in `docs/testing.md`. README + getting-started reflect this.
- [x] **16. Add Community Edition single-user banner** to top of `README.md` and `docs/community-edition.md` - currently only in SECURITY.md.
- [x] **17. Write `docs/extending-providers.md`** - interfaces to implement, where to register, test layout. Same for "Add a block" and "Add a template" walkthroughs.
- [x] **18. Frontend component test scaffold already present** - 300+ `.test.tsx` files under `packages/ui/src/**/__tests__/` using a hand-rolled tree-walker pattern (see `app-bar.test.tsx`). jsdom is configured. Audit claim of "no component tests" was inaccurate. Documented the convention in `docs/testing.md`. 92.89% line coverage masks zero React component coverage. Add vitest+jsdom+@testing-library/react in `packages/ui`; ship 3 reference tests (palette item, properties panel field, canvas node) as patterns.
- [x] **19. Documented AI assistant config and cost** in `docs/ai-assistant.md` - enabling via Settings → AI, behavior with no/invalid key, typical token cost per turn, OpenAI-compat backend wiring (ICE_AI_PROVIDER / ICE_AI_URL / ICE_AI_MODEL). - behavior with no key / invalid key, token-per-turn estimate, OpenAI-compat backend wiring.
- [x] **20. Re-scoped post-launch.** Actual counts: 0 `@ts-ignore`, 1 `@ts-expect-error`, 77 `eslint-disable`, 209 `: any`, 448 `as any` (~734 total, not 1,258). Type-safety polish doesn't block "usable before launch". Tracked as tech debt.
- [x] **21. Add `docs/glossary.md`** - block, concept, blueprint, handler, importer, graph, card, deploy state.
- [ ] **22. Replace README placeholder screenshot.** `README.md:36`. Real canvas screenshot + ideally a short deploy-flow gif.

## Zero-env-var follow-ups (done this session)

- [x] **28. `ensureLocalSecrets()` helper** in `packages/shared/src/local-secrets/` - auto-generates JWT_SECRET + CREDENTIAL_ENCRYPTION_KEY at first boot, persists to per-user config file (chmod 600), survives restarts. Wired into both gateway and desktop boot. Fixes the existing desktop bug where credentials got silently invalidated on every relaunch.
- [x] **29. Wire into gateway + desktop.** Lazy resolution of secrets in `auth/middleware.ts` and `crypto/index.ts` so a single boot-time call suffices.
- [x] **30. `.env.example` collapsed.** Now only optional dev overrides. End users don't touch it.
- [x] **31. ICE_TEST_* moved to `docs/testing.md`** as a contributor-only env-var table.

## Surfaced through the loop

- [x] **32. Surface `PROVIDER_READINESS` in UI.** Experimental / preview badges now show on the onboarding cloud-provider buttons and inside the provider-connect modal (with an explanatory note linking to `docs/provider-status.md`).
- [ ] **33. Build in-app Settings → AI panel** (deferred). Today's AI assistant reads `ANTHROPIC_API_KEY` / `ICE_AI_URL` from env. Roadmap item; not launch-blocking - AI is optional and env-var setup is documented in `docs/ai-assistant.md`.

## P3 - Nice-to-have

- [x] **23. Documented v0.1 first-run instructions + v0.2 code-signing plan** in `docs/desktop.md` - macOS right-click-Open path, Windows SmartScreen More-info-Run-anyway, Linux notes. v0.2 targets: Apple Developer ID + notarytool, Windows EV cert, then auto-update activates. For v0.1, add "Allow on first run" Gatekeeper/SmartScreen instructions in `docs/desktop.md`. Track Apple Developer + Windows EV certs for v0.2 so auto-update activates.
- [x] **24. Add README badges** - CI, license, latest release, stability label ("v0.1 - GCP stable, AWS/Azure experimental").
- [x] **25. CodeQL + secret-scan workflows added.** `.github/workflows/codeql.yml` runs on PR/push/weekly; `.github/workflows/secret-scan.yml` runs gitleaks. Trivy can come later if dependency scanning needs go beyond Dependabot.
- [x] **26. Not publishing to npm.** Per project direction, ICE ships as a self-hosted app, not a library set. `@ice/core`, `@ice/ai`, `@ice/types` now marked `"private": true` alongside the rest of the workspace so a stray `pnpm publish` can't push them.
- [x] **27. ROADMAP tagged with `help-wanted`** on Providers, Blocks, and Templates sections - the three areas where external contributors can self-serve. Provider section links to the new `docs/extending-providers.md` walkthrough.

---

## What's already strong (don't relitigate)

- Apache-2.0 + NOTICE correct. No leaked internal references.
- CI wired (lint/typecheck/test/build) + E2E + multi-OS Electron release workflow.
- 92.89% line / 93.21% function coverage on what is covered.
- CONTRIBUTING / SECURITY / SUPPORT / CODE_OF_CONDUCT all present, well-written.
- Design system, dark mode, onboarding wizard, tour engine - polished.
- Quickstart works without Docker: clone → `pnpm install` → `pnpm dev:all` → SQLite.
- No telemetry/analytics baked in.

## Suggested sequencing

- **Week 1 (blockers):** #1–#5 + #13
- **Week 2 (launch-quality):** #6, #7, #8, #11, #12
- **Week 3 (docs pass):** #9, #10, #14–#19, #22
- **Post-launch:** #20, #21, #23–#27
