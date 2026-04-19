# Community Edition — What's Different

This is the open-source Community edition of ICE. Fully functional infrastructure design and deployment — no login, no billing, no OAuth.

## Key Differences from SaaS

### No authentication

- No login, signup, or OAuth pages
- A local user + organisation are auto-created on first startup
- All API requests use the auto-seeded user (no JWT validation)
- The app loads straight to the canvas

### No billing

- No billing service, no Stripe, no usage tracking, no pricing

### No team management

- Single user — no invite system, no member roles, no team page
- Multiple organisations are supported (for organising projects)
- "Create organisation" replaces "Create team" throughout the UI

### No user profile settings

- No avatar dropdown in the app bar
- No settings page (no password change, no profile editing)
- No logout button

### Simplified onboarding

4-step flow (vs 5 in SaaS):
1. **Welcome** — introduction
2. **Connect Cloud** — provider selection + service account key (no Google OAuth)
3. **Connect GitHub** — PAT token (default) or Device Flow
4. **First Project** — name + template selection

### Simplified gateway

`apps/gateway/src/index.ts`:
- Mounts 6 services (no billing, no Passport)
- Auto-seeds local user + org on startup
- Serves the web app as static files
- No Stripe/OAuth webhook handlers

### Simplified auth middleware

`packages/shared/src/auth/middleware.ts`:
- `requireAuth` always uses the auto-seeded local user
- No JWT token validation needed

### Simplified frontend

- `packages/ui/src/shared/api/auth.ts` — `isAuthenticated()` always returns `true`
- `packages/ui/src/shared/api/axios-instance.ts` — no JWT handling, no token refresh, no logout redirect
- `packages/web/src/app/app.tsx` — no auth routes, no `ProtectedRoute` wrapper

## Files Removed (vs SaaS)

```
services/billing/                              # Entire billing service
services/iam/src/configs/passport-oauth.ts     # OAuth Passport strategies
services/iam/src/routes/oauth.ts               # OAuth routes
services/iam/src/routes/users.ts               # Team member management (mount removed)
packages/web/src/pages/login.tsx               # Login page
packages/web/src/pages/signup.tsx              # Signup page
packages/web/src/pages/auth-callback.tsx       # OAuth callback page
packages/web/src/pages/invite-accept.tsx       # Invite accept page (route removed)
packages/ui/src/shared/components/oauth-buttons.tsx  # Google/GitHub OAuth buttons
packages/block-registry/                       # Unused registry package
packages/provider-registry/                    # Unused registry package
packages/template-registry/                    # Unused registry package
```

## Files Modified (vs SaaS)

```
apps/gateway/src/index.ts                      # No billing, no Passport, auto-user
apps/gateway/package.json                      # No billing/passport deps
apps/desktop/src/main/index.ts                 # No DevTools, clean logs, auto-updater
packages/shared/src/auth/middleware.ts          # Always use local user
packages/ui/src/shared/api/auth.ts             # isAuthenticated() = true, stubs
packages/ui/src/shared/api/axios-instance.ts   # No JWT handling
packages/ui/src/shared/components/app-bar.tsx   # No ProfileAvatar
packages/ui/src/features/account/components/profile-avatar.tsx  # No logout, no settings link
packages/ui/src/features/account/components/user-settings-page.tsx  # Profile name only, no password
packages/ui/src/features/onboarding/components/onboarding-page.tsx  # 4 steps (no team step)
packages/ui/src/features/onboarding/components/connect-cloud-step.tsx  # No Google OAuth
packages/ui/src/features/onboarding/components/connect-github-step.tsx  # PAT default tab
packages/ui/src/i18n/en.json                   # "team" → "organisation"
packages/ui/src/i18n/zh.json                   # "团队" → "组织"
packages/web/src/app/app.tsx                   # No auth/team/settings routes
packages/web/src/packages/web/vite.config.ts   # Proxy to port 5002
packages/web/src/packages/web/package.json     # Dev port 5174
services/iam/src/index.ts                      # No OAuth/user routes
services/iam/src/routes/auth.ts                # Only /me + /switch-org
services/iam/src/routes/profile.ts             # Only /name (no password)
docker-compose.yml                             # Different ports, no gateway container
.env                                           # Community-specific config
.env.example                                   # Simplified
.gitignore                                     # Ignores compiled output in src/
```

## Running

```bash
pnpm dev:all    # starts postgres:5557 + redis:6380, gateway:5002, web:5174
```

Open `http://localhost:5174` — straight to canvas.
