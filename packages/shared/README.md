# @ice/shared

Cross-cutting concerns reused by every service: auth middleware, credential encryption, Socket.IO setup, local-secret bootstrap.

Where to start reading:

- `src/auth/middleware.ts` — `requireAuth`, `requireProjectAccess`, `requireOrgRole`, JWT issuance. Has a desktop-mode bypass (auto-seeded local user) so Community Edition doesn't need real auth.
- `src/crypto/index.ts` — AES-256-GCM helpers for credential storage. Reads `CREDENTIAL_ENCRYPTION_KEY` lazily.
- `src/local-secrets/index.ts` — `ensureLocalSecrets()`. Auto-generates and persists `JWT_SECRET` + `CREDENTIAL_ENCRYPTION_KEY` to a per-user config dir so users never set them. Called at gateway / desktop boot.
- `src/socket/service.ts` — Socket.IO server initialization and the deploy-event emit surface.
