# Deferred — Non-goals with reasoning

Items we considered and explicitly chose not to include in this plan. Each has a short justification so we don't relitigate the decision every time someone suggests one of them.

## Feature ideas postponed

### Cost estimation delta in the deploy panel

**Idea:** Show "current state: $120/month, after this deploy: $145/month (+$25)" before Apply.

**Why not now:** Real cost estimation requires a pricing model that's constantly changing (GCP price sheets, region multipliers, commitment discounts) and resource-level metering (vCPU hours, storage GB, egress). It's a multi-week effort that addresses a nice-to-have, not a blocker. Revisit after Phase 7 when the core deploy loop is stable.

**Future owner:** Dedicated billing/cost phase.

---

### AI chat integration with deploy errors

**Idea:** "Explain this error" button that sends the error + deploy context to the AI chat panel for debugging help.

**Why not now:** The AI chat panel exists but isn't currently aware of deploy state. Wiring deploy context into chat is a non-trivial integration that would be better done as part of a dedicated AI-assistance phase. Phase 3's error-to-remediation mapping already covers the most common cases with static content, which is more reliable than AI for a first pass.

**Future owner:** AI assistance phase.

---

### Multi-environment parallel deploys

**Idea:** Click "Deploy to dev + staging simultaneously" and have ICE orchestrate both.

**Why not now:** Phases 1, 5, and 6 already make multi-environment correct (per-card-per-env state, per-env mapping, per-env unique constraint). Doing parallel deploys on top of that is a UX feature, not a correctness fix. The single-environment-at-a-time workflow is fine for now; users can deploy to one env, then the next.

**Future owner:** Environments UX phase.

---

### Automatic DNS provisioning via Cloudflare / Route53 / Google Cloud DNS

**Idea:** When a block requires a DNS record, let ICE add it automatically via an integration with the user's DNS provider.

**Why not now:** Phase 4's block requirements framework is explicitly designed to accommodate this in the future — the `action` field on a requirement can be "instruct the user" or "do it automatically" without changing the requirement shape. For Phase 4's first pass, manual instructions are good enough. Automating requires separate provider integrations, each of which is its own auth flow, its own error handling, its own testing.

**Future owner:** DNS automation phase (post-Phase-4).

---

### Rollback UI surface

**Idea:** A proper "Roll back to deployment X" flow in the deploy panel.

**Why not now:** `rollbackDeployment` exists in the backend. Phase 5's history view adds a "Roll back to this" button in the expanded row view, which covers 80% of the need. A dedicated rollback wizard with impact preview is a Phase 8 item if we ever do one.

**Future owner:** Future rollback phase if demand materializes.

---

### Keyboard shortcuts for the deploy panel

**Idea:** `Ctrl+D` to open deploy panel, `Ctrl+P` to plan, `Ctrl+Enter` to apply, etc.

**Why not now:** Polish item. Not blocking any workflow. Add when the feature set stabilizes and we can design a consistent shortcut system across ICE.

**Future owner:** Polish phase.

---

### Webhook CI integration for GitHub repos

**Idea:** When a repo is attached to a block, automatically set up a webhook so pushes trigger redeploys.

**Why not now:** Depends on ICE having a GitHub App with webhook permissions and a publicly-reachable webhook endpoint. Both are infrastructure questions, not deploy-system questions. Phase 4 surfaces the "repo is attached" state, which unblocks this feature whenever the GitHub App is ready.

**Future owner:** CI/CD integration phase.

---

### Environment comparison UI (dev vs. prod diff)

**Idea:** "Show me what's different between my dev and prod deployments."

**Why not now:** Nice feature for mature deployments, not useful until users have multiple environments actually running. Phase 6 makes the underlying data model support it. UI is a future phase.

**Future owner:** Multi-environment polish phase.

---

### Memory scrubbing of SA key strings

**Idea:** After writing the SA key to disk, zero out the in-memory JavaScript string.

**Why not now:** JavaScript doesn't provide reliable memory scrubbing. Strings are immutable, the runtime caches and GC does what it wants. The real mitigations — 0o600 file perms, per-deploy temp dir, SIGTERM cleanup — are all in Phase 0. A full secret-handling overhaul is out of scope for this plan.

**Future owner:** Security hardening phase.

---

### Tenant isolation enforced at the database layer

**Idea:** Postgres row-level security policies so even a SQL-level bug can't cross organizational boundaries.

**Why not now:** Current tenant isolation is at the route middleware layer (`requireProjectAccess`). That's defensible — every route enforces it, and adding RLS is a large, invasive change that would slow every query. Revisit if we ever have a multi-customer SaaS deployment where compromise of a single user would be catastrophic.

**Future owner:** Security hardening phase.

---

## Bugs deferred with explicit reasoning

### Cycle detection beyond "nodes stranded"

**Issue:** Phase 0 Step 0.7 detects cycles by checking if nodes were left out of the topological sort. It doesn't identify the cycle's participants precisely, just names all stranded nodes.

**Why not now:** The important thing is surfacing the error. Naming specific cycles requires a DFS-based algorithm and is more work for marginal benefit. Users will see the stranded nodes and figure out which ones loop.

**Revisit if:** users complain the error message isn't actionable.

---

### Destroy ordering within-type

**Issue:** When multiple resources of the same type reference each other (two Cloud Run services sharing a Pub/Sub topic), destroy order within the type isn't guaranteed.

**Why not now:** Phase 0 Step 0.4's reverse-topological-order fix catches cross-type dependencies. Within-type ordering is a narrower problem that hasn't actually bitten anyone yet.

**Revisit if:** users report specific destroy failures that match this pattern.

---

### GitHub App auto-install

**Issue:** Phase 4 requires the user to manually install the GitHub App. ICE doesn't currently offer an install flow.

**Why not now:** Requires a full GitHub App registration + install redirect flow + app-level auth tracking. That's a separate project. Phase 4 documents the requirement and gives the user a link to do it manually.

**Revisit if:** GitHub App install is the top friction point after Phase 4 ships.

---

## How to add something to this document

If you're reading a phase file and thinking "wait, shouldn't X also be here," check this file first. If X isn't already deferred with reasoning, either:

1. Add it to the appropriate phase file as a new step, **or**
2. Add it to this file under a new section with a short reason.

Don't silently add scope to a phase without updating its effort estimate and acceptance criteria. Plans are living documents, but they're useful precisely because they're bounded.
