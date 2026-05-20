# @ice/db

The Prisma data layer. SQLite for dev/desktop, PostgreSQL for hosted ICE Cloud — same schema either way.

Where to start reading:

- `prisma/schema.prisma` — the canonical model. User, Organisation, Project, CanvasCard, CanvasDeployment, ProviderCredential, GithubInstallation, Pipeline, etc.
- `prisma/migrations/` — migration history. Run `pnpm dev:setup` to apply.
- `prisma/seed.ts` — dev seed. Generates a random password and prints it; controlled by `ICE_SEED_EMAIL` / `ICE_SEED_PASSWORD`.
- `src/index.ts` — singleton `PrismaClient` export.

DB lifecycle commands run through pnpm at the repo root: `pnpm dev:setup` (push schema), `pnpm seed` (insert default user).
