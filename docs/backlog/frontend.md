# Frontend Backlog

> **Status: All 18 items fixed** (2026-03-22)

## FE-1: Hardcoded test credentials on login page (P1) -- FIXED

**Fix applied:** Default email/password state set to empty strings.

---

## FE-2: No error boundaries in component tree (P1) -- FIXED

**Fix applied:** Created `ErrorBoundary` component with recovery UI. Wraps App root and Canvas/DynamicContent.

---

## FE-3: `persistMessages` race condition — duplicate conversations (P2) -- FIXED

**Fix applied:** Ref-backed `conversationIdRef` with lock (`_persistLock`) prevents parallel calls from both creating new conversations.

---

## FE-4: `useEffect` stale closure in EnvironmentTabBar (P2) -- FIXED

**Fix applied:** Added `handleSwitchEnv` to the dependency array.

---

## FE-5: Dual `store.subscribe` listeners — performance overhead (P2) -- FIXED

**Fix applied:** UI pane listener uses shallow comparison (`splitView === _lastUiSplitView`) to skip no-ops.

---

## FE-6: Deploy slice `history` array unbounded (P2) -- FIXED

**Fix applied:** Capped at 50 entries with `state.history = state.history.slice(0, 50)` after each unshift.

---

## FE-7: EnvironmentTabBar fetches deploy status in serial `for` loop (P2) -- FIXED

**Fix applied:** Uses `Promise.allSettled()` for parallel fetches with `cancelled` flag guard for unmount safety.

---

## FE-8: `fetchProfile` dispatched from two places (P2) -- FIXED

**Fix applied:** `PageLayout` only dispatches `fetchProfile` when `user` is null (idempotency guard). Primary fetch happens in `DynamicContent`.

---

## FE-9: Onboarding marks complete even when project creation fails (P2) -- FIXED

**Fix applied:** Catch block shows error via `setError()` instead of calling `completeOnboarding()`. User can retry.

---

## FE-10: Team step "join team" — invite code never submitted (P2) -- FIXED

**Fix applied:** `inviteCode` wired to Redux onboarding slice via `setInviteCode` action. No longer dead local state.

---

## FE-11: AWS region strings in all GCP templates (P2) -- FIXED

**Fix applied:** All `us-east-1` replaced with `us-central1`, `eu-west-1` replaced with `europe-west1` across 6 template files.

---

## FE-12: `useAiCommand` duplicates API base URL (P3) -- FIXED

**Fix applied:** Imports `BASE_URL` from `axios-instance.ts` instead of duplicating with unsafe cast.

---

## FE-13: AppBar not memoized (P3) -- FIXED

**Fix applied:** Wrapped with `React.memo()` and added `displayName`.

---

## FE-14: `setAccessToken('')` instead of `null` on logout (P3) -- FIXED

**Fix applied:** Changed to `setAccessToken(null)`.

---

## FE-15: Signup error div missing accessibility attributes (P3) -- FIXED

**Fix applied:** Added `role="alert" aria-live="polite"` to error div, matching login page.

---

## FE-16: `console.log` in production pipeline panel (P3) -- FIXED

**Fix applied:** Removed 3 `console.log` statements from pipeline-panel.tsx.

---

## FE-17: `ProtectedRoute` doesn't check JWT expiry (P3) -- FIXED

**Fix applied:** `isAuthenticated()` now decodes JWT payload and checks `exp` claim. Expired tokens are cleared from localStorage and user is redirected to login.

---

## FE-18: Unused dependencies in `packages/web/package.json` (P3) -- FIXED

**Fix applied:** Removed `@xyflow/react`, `react-hook-form`, and `zod` from dependencies.
