# Frontend Backlog

## FE-1: Hardcoded test credentials on login page (P1)

**File:** `packages/web/src/pages/login.tsx:14-15`

```ts
const [email, setEmail] = useState('test@ice-saas.dev');
const [password, setPassword] = useState('password123');
```

Pre-filled credentials ship to production.

**Fix:** Default to empty strings. Use `.env` for dev-only pre-fills if needed.

---

## FE-2: No error boundaries in component tree (P1)

**Files:** All feature components, `packages/web/src/app/app.tsx`

No `ErrorBoundary` components anywhere. A runtime error in the canvas (complex SVG rendering with coordinate math) crashes the entire app with a white screen.

**Fix:** Add `ErrorBoundary` wrapping the canvas, AI panel, and top-level app. Show recovery UI.

---

## FE-3: `persistMessages` race condition — duplicate conversations (P2)

**File:** `packages/web/src/features/ai/components/ai-chat-panel.tsx:163-196`

When `conversationId` is null, parallel calls to `persistMessages` (user + assistant messages) both see `null` and each POST a new conversation.

**Fix:** Use a ref-backed singleton for conversation ID. Set synchronously, not via React state.

---

## FE-4: `useEffect` stale closure in EnvironmentTabBar (P2)

**File:** `packages/web/src/features/environments/components/environment-tab-bar.tsx:119`

`handleSwitchEnv` missing from dependency array. If `projectId` or `dispatch` change between renders, the effect captures a stale closure.

**Fix:** Add `handleSwitchEnv` to the dependency array.

---

## FE-5: Dual `store.subscribe` listeners — performance overhead on every dispatch (P2)

**File:** `packages/web/src/store/index.ts:77-134`

Two separate `store.subscribe` calls both fire on every Redux dispatch, including high-frequency canvas drags. No guard to skip irrelevant actions.

**Fix:** Early-return in each listener if the relevant slice state hasn't changed (use shallow comparison).

---

## FE-6: Deploy slice `history` array unbounded (P2)

**File:** `packages/web/src/store/slices/deploy-slice.ts:218-229`

`state.history.unshift(...)` with no cap. Grows forever in long sessions.

**Fix:** Add a cap (e.g., `state.history = state.history.slice(0, 50)`).

---

## FE-7: EnvironmentTabBar fetches deploy status in serial `for` loop (P2)

**File:** `packages/web/src/features/environments/components/environment-tab-bar.tsx:55-72`

Sequential `await` in a loop for 4+ environments. No abort on unmount.

**Fix:** Use `Promise.all()`. Add `AbortController` or mounted ref guard.

---

## FE-8: `fetchProfile` dispatched from two places — duplicate API calls on navigation (P2)

**File:** `packages/web/src/app/app.tsx:267-268, 384`

Both `DynamicContent` and `PageLayout` dispatch `fetchProfile()` on mount, creating parallel in-flight requests.

**Fix:** Fetch profile once at the app root level or add idempotency to the thunk.

---

## FE-9: Onboarding marks complete even when project creation fails (P2)

**File:** `packages/web/src/features/onboarding/components/onboarding-page.tsx:121-125`

The catch block calls `completeOnboarding()` and navigates away. User ends up with no project and can't re-enter onboarding.

**Fix:** Show error toast. Only mark onboarding complete on success or explicit user dismissal.

---

## FE-10: Team step "join team" — invite code never submitted (P2)

**File:** `packages/web/src/features/onboarding/components/team-step.tsx`

`inviteCode` state is collected but never used, passed to parent, or sent to any API. The "join team" path is non-functional UI.

**Fix:** Wire up the invite code submission to `POST /api/invite/:token/accept` or remove the UI.

---

## FE-11: AWS region strings in all GCP templates (P2)

**Files:** All template files in `packages/templates/src/`

Every GCP template has `region: 'us-east-1'` (AWS format). GCP uses `us-east1` (no hyphen). This will fail at deploy time.

**Fix:** Change all to valid GCP region identifiers (e.g., `us-central1`).

---

## FE-12: `useAiCommand` duplicates API base URL (P3)

**File:** `packages/web/src/features/ai/hooks/use-ai-command.ts:34`

Uses `(import.meta as any).env?.VITE_API_URL || '/api'` — duplicates `BASE_URL` from `axios-instance.ts` with an unsafe cast.

**Fix:** Import `BASE_URL` from axios-instance.

---

## FE-13: AppBar not memoized — re-renders on every Redux dispatch (P3)

**File:** `packages/web/src/app/app.tsx:81`

`AppBar` reads 6+ store values that change frequently. Not wrapped with `React.memo`.

**Fix:** Wrap with `React.memo`.

---

## FE-14: `setAccessToken('')` instead of `null` on logout (P3)

**File:** `packages/web/src/features/account/components/profile-avatar.tsx:30`

Works by accident (empty string is falsy). Will break if truthiness logic changes.

**Fix:** Change to `setAccessToken(null)`.

---

## FE-15: Signup error div missing accessibility attributes (P3)

**File:** `packages/web/src/pages/signup.tsx:57-60`

Login page has `role="alert" aria-live="polite"` on error div. Signup page doesn't.

**Fix:** Add `role="alert" aria-live="polite"`.

---

## FE-16: `console.log` in production pipeline panel (P3)

**File:** `packages/web/src/features/pipeline/components/pipeline-panel.tsx:95, 106, 131`

Three `console.log` statements logging internal state.

**Fix:** Remove or gate behind `NODE_ENV`.

---

## FE-17: `ProtectedRoute` doesn't check JWT expiry (P3)

**File:** `packages/web/src/app/app.tsx:59-62`

`isAuthenticated()` only checks token presence, not expiry. Expired token passes the route guard, showing protected content briefly before API calls fail.

**Fix:** Check token expiry in `isAuthenticated()`. Redirect to login if expired.

---

## FE-18: Unused dependencies in `packages/web/package.json` (P3)

**File:** `packages/web/package.json:39, 47, 54`

`@xyflow/react`, `react-hook-form`, and `zod` are declared but never imported.

**Fix:** Remove from dependencies.
