# @ice/service-credentials

Stores and retrieves provider credentials. Credentials are AES-256-GCM-encrypted at rest using the key managed by `ensureLocalSecrets()` (see `@ice/shared`).

Where to start reading:

- `src/routes/credentials.ts` — HTTP surface (list, save, delete, validate).
- `src/services/credential.service.ts` — encrypt/decrypt boundary. Anything that writes to the DB goes through here.

Only the in-app **Settings → Providers** flow writes credentials — there's no env-var path on purpose.
