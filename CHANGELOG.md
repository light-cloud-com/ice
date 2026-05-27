# Changelog

All notable changes to ICE are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses a simplified semver: `MAJOR.MINOR.PATCH`.

## [Unreleased]

### Added — Provider parity drive

- **Azure rebuild (Phase B)** — modular dispatcher at `packages/core/src/deploy/providers/azure/` replaces the legacy monolith (back-compat shim kept). 35+ handlers ship: PostgreSQL Flex, MySQL Flex, Redis Cache, Cosmos DB (SQL + Mongo), SQL Server, Static Web Apps, App Service Plan, Container Apps (service + worker), Functions, AKS, ACR, VNet, Subnet, NSG, Private Endpoint, DNS Zone, Application Gateway, Front Door, WAF Policy, APIM, Service Bus (with AMQP/RabbitMQ branch), Event Hubs, Event Grid, Logic Apps, Cognitive Search (also backs AI.VectorDB), Azure OpenAI, Azure ML, Synapse, Data Explorer (Kusto), Entra External ID (B2C), Log Analytics, App Insights, Key Vault, Storage Account.
- **AWS Phase A** — new handlers + extractors: VPC / Subnet / SecurityGroup, ACM cert, Route53 record, EventBridge schedule branch, CodeBuild project, Amplify Hosting, Amazon MQ, WAFv2, VPC Endpoint, OpenSearch Serverless. ECS / ELBv2 / RDS / ElastiCache now consume canvas-wired VPC blocks. CloudFront consumes a canvas-wired ACM certificate ARN when present.
- **Update paths** for CloudFront (UpdateDistribution + ETag), Cognito (UpdateUserPool), DocDB (ModifyDBCluster), Redshift (ModifyCluster), and EC2 (ModifyVolume — EBS resize).
- **Lambda auto-build CodeBuild fallback** — when local `git` / `npm` / `zip` aren't available the handler dispatches the build to a transient CodeBuild project.
- **Live test foundation** — per-handler `*.live.test.ts` files at `packages/core/src/deploy/providers/__tests__/live/`. Developer self-serve via `pnpm test:live:aws <service>` / `pnpm test:live:azure <service>` (NOT in CI; touches real cloud, costs real money). JSONL audit trail under `e2e/{aws,azure}-deployment-tests/runs/`. Orphan-cleanup scripts at `e2e/{aws,azure}-deployment-tests/cleanup-orphans.ts` sweep resources tagged `ice:test-run-id=*`.
- **Azure importer** — `importers/azure/relationships.ts` infers dependencies between imported resources by scanning property payloads for resource-id references; case-insensitive matching with self-ref skip. Type-mapper aligned with the new deployer prefixes so imports route to the right deploy handler.
- **Operator-notes README** — `packages/core/src/deploy/providers/azure/README.md` documents the per-category rollout state, quirks (global-uniqueness names, long-running ops, password-required services, Cosmos API projection, Container Apps env auto-bootstrap, Logic Apps schedule sugar, Cognitive Search dual purpose), and the extension contract.

### Security

- Seed script (`packages/db/prisma/seed.ts`) no longer hard-codes a password - reads `ICE_SEED_EMAIL` / `ICE_SEED_PASSWORD` from env, generates a random password when unset, and prints it to stdout for first-run convenience.
- Gateway CSP `connectSrc` only allows `ws://localhost:*` / `http://localhost:*` when `NODE_ENV` is `development` or `test`.
- `OpenAICompatProvider` now throws at construction time in production if neither `ICE_AI_URL` nor an explicit `baseUrl` is configured, instead of silently defaulting to `http://localhost:8000`.
- Desktop secrets now persist across launches. Previously `apps/desktop/src/main/index.ts` regenerated `JWT_SECRET` / `CREDENTIAL_ENCRYPTION_KEY` with `randomBytes` on every boot, silently invalidating every DB-encrypted provider credential. Replaced with `ensureLocalSecrets()` which writes to a per-user config file (chmod 600).

### Added

- `ensureLocalSecrets()` helper in `@ice/shared` that auto-generates and persists `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` to a platform-stable per-user config path. Called from the gateway boot - since the desktop runs the gateway in-process (production) or as a child (dev), the bootstrap fires for both paths. Community Edition needs zero env vars.
- `PROVIDER_READINESS` constant in `packages/constants/src/providers.ts` (GCP=stable, AWS/Azure=experimental, K8s/Alibaba/OCI/DO=design-only) plus a `readiness` field on `CloudProviderMeta`. Source-of-truth for in-app badges and docs.
- `docs/provider-status.md` - per-provider readiness matrix with the supported handler set spelled out.
- `docs/troubleshooting.md` - common install, dev, deploy, and test issues with actual fixes.
- `docs/extending-providers.md` - step-by-step walkthrough for contributors adding a new cloud provider.
- `docs/glossary.md` for the project vocabulary (block, concept, blueprint, handler, importer, etc.).
- Stub deploy guides for AWS (`docs/deploying-to-aws.md`) and Azure (`docs/deploying-to-azure.md`).
- Package-level READMEs for `packages/{core,ui,blocks,db,shared,ai,constants,templates,web}`, `apps/{gateway,desktop}`, and `services/{deploy,credentials}` - each 5–10 lines pointing to the right entry files.
- `.github/dependabot.yml` for weekly npm + github-actions dependency updates, grouped by ecosystem.
- `.github/workflows/codeql.yml` running CodeQL on PR/push plus a weekly cron.
- `.gitleaks.toml` + `.github/workflows/secret-scan.yml` running gitleaks on every PR and push to main.
- Community Edition single-user warning banner on `README.md` and `docs/community-edition.md`.
- `CHANGELOG.md` (this file).
- `OSS_LAUNCH_CHECKLIST.md` tracking the open-source release prep.

### Changed (this batch)

- AI assistant docs now describe the in-app **Settings → AI** flow, the unset/invalid-key behavior, typical per-turn token cost, and the `ICE_AI_PROVIDER` / `ICE_AI_URL` / `ICE_AI_MODEL` knobs for OpenAI-compatible backends.
- Desktop docs include explicit first-run instructions for unsigned macOS / Windows / Linux v0.1 binaries and the v0.2 code-signing plan (Apple Developer ID + Windows EV cert + auto-update activation).
- ROADMAP Providers / Blocks / Templates sections tagged `help-wanted` with a pointer to the new extending-providers guide.

### UI

- Onboarding cloud-provider buttons and the provider-connect modal now show an "Experimental" or "Preview" badge for providers whose `PROVIDER_READINESS` is not `stable` - GCP looks normal, AWS/Azure get a clear caveat, and design-only providers get an inline note pointing to `docs/provider-status.md`.

### Build

- Generated schemas no longer ship in the repo. The whole `packages/core/src/schemas/generated/` tree (resource-types.ts, raw provider extracts, unified-types.json - ~550 MB) is gitignored. Contributors run `pnpm schemas:build` once per clone; it caches to `.schema-cache/` so subsequent builds are seconds. Four stale build-artifact companions (`index.d.ts`, `index.js`, `resource-types.d.ts`, `resource-types.js`) that were tracked from before the gitignore landed are removed from the index. README + CONTRIBUTING + docs/getting-started + docs/troubleshooting all document the new bootstrap step.

### Accessibility

- Onboarding-page Back / Skip / Next buttons gained `aria-label`; decorative `lucide` icons inside them are `aria-hidden`.
- `SidebarStrip` buttons gained `aria-label` and `aria-pressed`; icons and the active-indicator bar are `aria-hidden`.
- Canvas `NodeHeader` gained `role="group"` and a synthesised `aria-label` (`"{category} block: {label}"`) so screen readers can describe block selection.

### Changed

- **`.env.example` collapsed to optional dev overrides only.** Community Edition runs with no env-var configuration. All credentials (GCP / AWS / Azure / Anthropic / GitHub) go through the in-app Settings → Providers UI and live encrypted in the workspace DB.
- `ICE_TEST_*` env vars (used only by `pnpm test:gcp` / `pnpm test:scenarios`) are now documented exclusively in `docs/testing.md` rather than in the user-facing `.env.example`.
- `JWT_SECRET` / `CREDENTIAL_ENCRYPTION_KEY` resolution made lazy in `packages/shared/src/auth/middleware.ts` and `packages/shared/src/crypto/index.ts` - so a single `ensureLocalSecrets()` call at boot suffices, with no module-load order traps.
- Stripped debug `console.log` noise from `packages/core/src/importers/gcp/services/asset-inventory.ts`, `services/deploy/src/services/destroy-deployment.ts`, `services/deploy/src/services/gcp-api-enabler.ts`, and `services/deploy/src/services/apply-pipeline-helpers.ts`. User-facing log lines (via `emitLog` / lifecycle banners) are unchanged.

## [0.1.x] - pre-release iterations

Pre-release development is recorded in git history. This changelog starts tracking from the open-source launch onwards.

[Unreleased]: https://github.com/light-cloud-com/ice/compare/v0.1.0...HEAD
