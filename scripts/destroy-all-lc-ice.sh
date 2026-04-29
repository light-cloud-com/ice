#!/usr/bin/env bash
#
# destroy-all-lc-ice.sh
# ─────────────────────
# Nukes every ICE-managed GCP resource in the `lc-ice` project AND every
# canvas project in the local desktop DB.
#
# Why this exists
# ───────────────
# Iterating on ICE templates against a real cloud project leaves quota-
# consuming residue (Cloud SQL ~$50/mo, Redis ~$40/mo, idle Cloud Run
# revisions, leaked storage buckets). The standard "Destroy" button only
# walks resources that are still mapped to existing canvas cards — if the
# canvas is gone, the orphan stays. This script bypasses ICE entirely and
# uses gcloud directly, scoped to the `ice-managed=true` label so we
# never touch unrelated resources someone else may have provisioned in
# the same project.
#
# Usage
# ─────
#   scripts/destroy-all-lc-ice.sh                    # interactive — confirm before each phase
#   scripts/destroy-all-lc-ice.sh --yes              # non-interactive — skip confirmations
#   scripts/destroy-all-lc-ice.sh --dry-run          # list what WOULD be deleted, no actual deletion
#   scripts/destroy-all-lc-ice.sh --delete-projects  # also wipe canvas_project rows from .desktop-dev.db
#   scripts/destroy-all-lc-ice.sh --project=other    # override target GCP project (default: lc-ice)
#
# Exit codes
# ──────────
#   0  — clean: no errors, no leftover ICE-managed resources detected
#   1  — at least one delete failed; the script continues but exits non-zero
#   2  — pre-flight failed (gcloud not authed, wrong project, etc.)

set -uo pipefail

# Disable every interactive gcloud prompt — including the "API not enabled,
# enable and retry? (y/N)" one that hangs the script the moment we hit a
# resource type whose API is currently disabled in the project (Cloud
# Functions, GKE, Memorystore, Pub/Sub, API Gateway, Secret Manager all
# trigger this on a fresh `lc-ice` install). With prompts disabled gcloud
# fails fast with a SERVICE_DISABLED error → our `2>/dev/null || true`
# wrappers capture it as an empty list and the phase moves on cleanly.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# Per-delete timeout — a single stuck resource (gcloud retrying a transient
# error, an LRO that never reports terminal, a backend service with
# orphaned NEG references) can otherwise hold the whole script forever.
# We wrap each gcloud delete in `timeout 5m` when the binary is available
# so the worst case is "5 minutes wasted on this resource, then move on".
# macOS doesn't ship `timeout` by default — Homebrew coreutils provides
# both `timeout` and `gtimeout`. If neither is present, we skip the wrap
# and the script behaves like before (no timeout, but still progress
# visibility from the per-resource print).
DELETE_TIMEOUT="${DELETE_TIMEOUT:-5m}"
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="$(command -v timeout)"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="$(command -v gtimeout)"
else
  TIMEOUT_BIN=""
fi

# ── Defaults / args ────────────────────────────────────────────────────────
PROJECT="lc-ice"
DRY_RUN=0
YES=0
DELETE_PROJECTS=0

for arg in "$@"; do
  case "$arg" in
    --yes|-y)            YES=1 ;;
    --dry-run|-n)        DRY_RUN=1 ;;
    --delete-projects)   DELETE_PROJECTS=1 ;;
    --project=*)         PROJECT="${arg#--project=}" ;;
    -h|--help)
      # macOS BSD sed doesn't accept `\?`; use `\{0,1\}` for the optional space.
      sed -n '/^# Usage/,/^# Exit codes$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "Unknown arg: $arg (try --help)" >&2
      exit 2 ;;
  esac
done

# Color codes — green/red/yellow/dim. Detected once; honors NO_COLOR.
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  RED=$'\e[31m' GREEN=$'\e[32m' YELLOW=$'\e[33m' DIM=$'\e[2m' BOLD=$'\e[1m' RESET=$'\e[0m'
else
  RED=""        GREEN=""        YELLOW=""         DIM=""        BOLD=""        RESET=""
fi

ERRORS=0

log()    { printf '%s\n' "$*"; }
info()   { printf '%s%s%s\n' "$DIM" "$*" "$RESET"; }
ok()     { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()   { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
fail()   { printf '%s✗%s %s\n' "$RED" "$RESET" "$*"; ERRORS=$((ERRORS + 1)); }
phase()  { printf '\n%s── %s ──%s\n' "$BOLD" "$*" "$RESET"; }

# ── Pre-flight ─────────────────────────────────────────────────────────────
phase "Pre-flight"

if ! command -v gcloud >/dev/null 2>&1; then
  fail "gcloud CLI not found in PATH"
  exit 2
fi
ok "gcloud CLI found ($(gcloud --version | head -1))"

ACCT="$(gcloud config get-value account 2>/dev/null || true)"
if [[ -z "$ACCT" || "$ACCT" == "(unset)" ]]; then
  fail "gcloud is not authenticated — run \`gcloud auth login\` first"
  exit 2
fi
ok "gcloud authed as $ACCT"

if ! gcloud projects describe "$PROJECT" >/dev/null 2>&1; then
  fail "GCP project '$PROJECT' not visible to $ACCT"
  exit 2
fi
ok "Target project: $PROJECT"

# Hard confirmation prompt unless --yes.
if (( ! YES && ! DRY_RUN )); then
  printf '\n%sThis will DELETE every ICE-managed resource in %s%s and is irreversible.%s\n' \
    "$RED" "$BOLD" "$PROJECT" "$RESET"
  if (( DELETE_PROJECTS )); then
    printf '%sIt will also DROP every canvas_project row from .desktop-dev.db.%s\n' "$RED" "$RESET"
  fi
  read -r -p "Type the project name ($PROJECT) to continue: " confirm
  if [[ "$confirm" != "$PROJECT" ]]; then
    log "Aborted."
    exit 2
  fi
fi

# ── Helper: list ICE-managed resources of a given category ─────────────────
# Each helper prints `<NAME>` (one per line) of resources to delete. Filters
# scope to ICE-managed only (`labels.ice-managed=true`) where the resource
# type supports labels; for types that don't (forwarding rules etc.), we
# match by name prefix `ice-` instead.
list_with_label() {
  local cmd="$1"
  gcloud --project="$PROJECT" $cmd --filter="labels.ice-managed=true" --format="value(name)" 2>/dev/null || true
}

list_with_prefix() {
  local cmd="$1"
  gcloud --project="$PROJECT" $cmd --filter="name~^ice-" --format="value(name)" 2>/dev/null || true
}

delete_each() {
  # Args: <category-label> <list-fn> <delete-cmd-template — uses {} as placeholder>
  # Example: delete_each "Cloud Run services" "run services list --region=us-central1" \
  #            "run services delete {} --region=us-central1"
  local category="$1"
  local list_cmd="$2"
  local del_template="$3"

  local items
  items=$(eval "$list_cmd" || true)
  if [[ -z "$items" ]]; then
    info "  $category: none"
    return
  fi
  local count=0
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    count=$((count + 1))
    local cmd="${del_template//\{\}/$name}"
    if (( DRY_RUN )); then
      printf '%s  would delete %s: %s%s\n' "$DIM" "$category" "$name" "$RESET"
      continue
    fi
    # Show progress BEFORE the gcloud call. Backend service / Cloud SQL /
    # Redis / GKE / VPC deletes are all 30-90s LROs that produce no output
    # while polling — without this line the user is staring at a frozen
    # terminal with no idea which resource is the slow one. The trailing
    # newline avoids \r-overwrite issues on terminals that don't support
    # cursor moves cleanly (electron / VS Code integrated term).
    local started_at
    started_at=$(date +%s)
    printf '%s  ⟳ %s: %s ...%s\n' "$DIM" "$category" "$name" "$RESET"
    # `< /dev/null` is a belt-and-suspenders against any gcloud version
    # that ignores CLOUDSDK_CORE_DISABLE_PROMPTS — closing stdin makes
    # interactive prompts fail immediately instead of blocking forever.
    # `timeout` caps the wall-clock per-resource so a stuck LRO can't
    # hold the whole script (exit 124 = timed out).
    local invoke_prefix=""
    if [[ -n "$TIMEOUT_BIN" ]]; then
      invoke_prefix="$TIMEOUT_BIN $DELETE_TIMEOUT"
    fi
    # Capture combined stdout+stderr so a real failure surfaces the
    # actual gcloud error message, AND so we can pattern-match for the
    # benign "already gone" case (NOT_FOUND etc.) — that case happens
    # naturally when an earlier-phase delete cascade-removed the
    # resource, or when the VPC delete cascade-removes its own subnets
    # before our explicit subnet-delete phase fires.
    local output
    local rc
    output=$(eval "$invoke_prefix gcloud --quiet --project=\"$PROJECT\" $cmd" </dev/null 2>&1)
    rc=$?
    local elapsed=$(( $(date +%s) - started_at ))
    if (( rc == 0 )); then
      ok "  $category: $name (${elapsed}s)"
    elif (( rc == 124 )); then
      fail "  $category: $name (timed out after ${elapsed}s — try \`gcloud … delete\` manually)"
    elif [[ "$output" =~ (NOT_FOUND|RESOURCE_NOT_FOUND|was\ not\ found|does\ not\ exist|already\ been\ deleted|notFound) ]]; then
      # Benign — resource is gone. Don't count toward ERRORS.
      info "  $category: $name (already gone, ${elapsed}s)"
    elif [[ "$output" =~ (auto[-\ ]mode|auto[-\ ]subnet|RESOURCE_NOT_DELETABLE|Cannot\ delete\ auto) ]]; then
      # Auto-mode subnetwork — GCP refuses independent delete; the
      # parent VPC delete will cascade it. ICE's VPC handler creates
      # auto-mode networks when `auto_create_subnets === true`
      # (Network.PrivateNetwork iceType — see
      # `packages/core/src/deploy/providers/gcp/handlers/vpc.ts:52`),
      # so this is the EXPECTED behavior, not an error. Don't count
      # toward ERRORS.
      info "  $category: $name (auto-mode — will cascade with VPC delete, ${elapsed}s)"
    else
      # Real failure — show the first non-empty line of the gcloud
      # output so the user can see WHY (subnet still attached to a
      # forwarding rule, quota issue, permission problem, etc.). The
      # full output is sometimes 20+ lines of YAML; truncate to keep
      # the script log readable.
      local first_line
      first_line=$(printf '%s\n' "$output" | grep -v '^[[:space:]]*$' | head -1)
      fail "  $category: $name (failed after ${elapsed}s)"
      printf '%s      %s%s\n' "$DIM" "${first_line:0:200}" "$RESET"
    fi
  done <<< "$items"
  info "  $category: $count handled"
}

# ── Phase 1: Load balancer chain (delete top-down) ──────────────────────────
# Order matters: globalForwardingRule → targetProxy → urlMap → backendService/Bucket
# Otherwise GCP rejects the delete with "resource is in use by X".
phase "Load balancer chain"

delete_each "global forwarding rules" \
  "list_with_prefix 'compute forwarding-rules list --global'" \
  "compute forwarding-rules delete {} --global"

delete_each "regional forwarding rules (us-central1)" \
  "gcloud --project='$PROJECT' compute forwarding-rules list --regions=us-central1 --filter='name~^ice-' --format='value(name)' 2>/dev/null" \
  "compute forwarding-rules delete {} --region=us-central1"

delete_each "target HTTPS proxies" \
  "list_with_prefix 'compute target-https-proxies list'" \
  "compute target-https-proxies delete {}"

delete_each "target HTTP proxies" \
  "list_with_prefix 'compute target-http-proxies list'" \
  "compute target-http-proxies delete {}"

delete_each "URL maps" \
  "list_with_prefix 'compute url-maps list'" \
  "compute url-maps delete {}"

delete_each "backend services" \
  "list_with_prefix 'compute backend-services list --global'" \
  "compute backend-services delete {} --global"

delete_each "backend buckets" \
  "list_with_prefix 'compute backend-buckets list'" \
  "compute backend-buckets delete {}"

delete_each "managed SSL certificates" \
  "list_with_prefix 'compute ssl-certificates list --global'" \
  "compute ssl-certificates delete {} --global"

delete_each "Cloud Armor security policies" \
  "list_with_prefix 'compute security-policies list'" \
  "compute security-policies delete {}"

delete_each "network endpoint groups (us-central1)" \
  "gcloud --project='$PROJECT' compute network-endpoint-groups list --filter='name~^ice- AND region:us-central1' --format='value(name)' 2>/dev/null" \
  "compute network-endpoint-groups delete {} --region=us-central1"

# ── Phase 2: Compute / runtime resources ───────────────────────────────────
phase "Compute / runtime"

delete_each "Cloud Run services" \
  "gcloud --project='$PROJECT' run services list --region=us-central1 --filter='metadata.labels.ice-managed=true' --format='value(metadata.name)' 2>/dev/null" \
  "run services delete {} --region=us-central1"

delete_each "Cloud Run jobs" \
  "gcloud --project='$PROJECT' run jobs list --region=us-central1 --filter='metadata.labels.ice-managed=true' --format='value(metadata.name)' 2>/dev/null" \
  "run jobs delete {} --region=us-central1"

delete_each "Cloud Functions (gen 2)" \
  "list_with_label 'functions list --regions=us-central1'" \
  "functions delete {} --region=us-central1 --gen2"

delete_each "GKE clusters" \
  "list_with_prefix 'container clusters list --location=us-central1'" \
  "container clusters delete {} --region=us-central1"

# ── Phase 2.5: Build artifacts ─────────────────────────────────────────────
# ICE creates an `ice-images` Artifact Registry repo (see
# `packages/core/src/deploy/providers/gcp/handlers/cloud-build-helper.ts`
# `ensure_artifact_registry`). The Cloud Build pushes build outputs into
# this repo. Deleting the repo recursively removes every image + tag.
# Cloud Build job HISTORY itself auto-expires (~6 months) and isn't
# manually deletable via gcloud — those rows just age out.
phase "Build artifacts (Artifact Registry)"

# Repos can be in any region. Iterate across known regions where ICE
# deploys (us-central1 is the default; widen if templates start using
# others). The list-with-location pattern: `list --location=<region>`
# returns plain repo names, no quirks.
delete_each "Artifact Registry repos (us-central1)" \
  "gcloud --project='$PROJECT' artifacts repositories list --location=us-central1 --filter='name~ice-' --format='value(name)' 2>/dev/null | xargs -I{} basename {}" \
  "artifacts repositories delete {} --location=us-central1"

# ── Phase 3: API Gateway (gateways → configs → APIs) ───────────────────────
phase "API Gateway"

delete_each "API Gateway gateways" \
  "list_with_prefix 'api-gateway gateways list --location=us-central1'" \
  "api-gateway gateways delete {} --location=us-central1"

# Configs and APIs need to be torn down per-API. List APIs once, then for
# each API list its configs.
APIS="$(list_with_prefix 'api-gateway apis list')"
if [[ -n "$APIS" ]]; then
  while IFS= read -r api; do
    [[ -z "$api" ]] && continue
    CONFIGS="$(gcloud --project="$PROJECT" api-gateway api-configs list --api="$api" --format='value(name)' 2>/dev/null || true)"
    if [[ -n "$CONFIGS" ]]; then
      while IFS= read -r cfg; do
        [[ -z "$cfg" ]] && continue
        cfg_name="${cfg##*/}"
        if (( DRY_RUN )); then
          info "  would delete api-config: $api/$cfg_name"
        elif gcloud --quiet --project="$PROJECT" api-gateway api-configs delete "$cfg_name" --api="$api" >/dev/null 2>&1; then
          ok "  api-config: $api/$cfg_name"
        else
          fail "  api-config: $api/$cfg_name"
        fi
      done <<< "$CONFIGS"
    fi
    if (( DRY_RUN )); then
      info "  would delete api: $api"
    elif gcloud --quiet --project="$PROJECT" api-gateway apis delete "$api" >/dev/null 2>&1; then
      ok "  api: $api"
    else
      fail "  api: $api"
    fi
  done <<< "$APIS"
else
  info "  APIs: none"
fi

# ── Phase 4: Stateful resources (data — destroyed last so handlers above can drain) ──
phase "Stateful resources"

delete_each "Cloud SQL instances" \
  "list_with_prefix 'sql instances list'" \
  "sql instances delete {}"

delete_each "Memorystore Redis instances" \
  "list_with_prefix 'redis instances list --region=us-central1'" \
  "redis instances delete {} --region=us-central1"

delete_each "Pub/Sub topics" \
  "list_with_prefix 'pubsub topics list'" \
  "pubsub topics delete {}"

# Storage buckets need recursive delete since gcloud refuses to drop a
# non-empty bucket. Use `gcloud storage rm -r` which removes contents+bucket.
ICE_BUCKETS="$(gcloud --project="$PROJECT" storage buckets list --filter='name~^ice-' --format='value(name)' 2>/dev/null || true)"
if [[ -z "$ICE_BUCKETS" ]]; then
  info "  Cloud Storage buckets: none"
else
  while IFS= read -r bucket; do
    [[ -z "$bucket" ]] && continue
    if (( DRY_RUN )); then
      info "  would delete bucket: gs://$bucket (recursive)"
    elif gcloud --quiet --project="$PROJECT" storage rm -r "gs://$bucket" >/dev/null 2>&1; then
      ok "  bucket: gs://$bucket"
    else
      fail "  bucket: gs://$bucket"
    fi
  done <<< "$ICE_BUCKETS"
fi

# ── Phase 4.5: Cloud Logging / Monitoring ──────────────────────────────────
# ICE's `gcp.logging.sink` handler (logging.ts) creates a sink per Log
# block on the canvas. Other monitoring resources (alert policies,
# dashboards, uptime checks) aren't currently created by any handler but
# we sweep them defensively in case templates start adding them — and
# sweep them with `name~^ice-` so a hand-created policy in the same
# project survives the destroy.
#
# IMPORTANT: NEVER delete `_Required` or `_Default` log sinks — those are
# GCP-managed system sinks. Our `name~^ice-` filter excludes them by
# definition (they don't start with `ice-`).
phase "Cloud Logging / Monitoring"

delete_each "log sinks" \
  "gcloud --project='$PROJECT' logging sinks list --filter='name~^ice-' --format='value(name)' 2>/dev/null" \
  "logging sinks delete {}"

delete_each "log-based metrics" \
  "gcloud --project='$PROJECT' logging metrics list --filter='name~^ice-' --format='value(name)' 2>/dev/null" \
  "logging metrics delete {}"

# Monitoring dashboards have an opaque numeric `name` (`projects/X/dashboards/<id>`)
# and only the displayName is meaningful — list filters on displayName and
# we delete by full name. Skip if the API isn't enabled (the standard
# 2>/dev/null + || true handles that).
DASH_NAMES="$(gcloud --project="$PROJECT" monitoring dashboards list --filter='displayName~^ice-' --format='value(name)' 2>/dev/null || true)"
if [[ -z "$DASH_NAMES" ]]; then
  info "  monitoring dashboards: none"
else
  while IFS= read -r dash; do
    [[ -z "$dash" ]] && continue
    if (( DRY_RUN )); then
      info "  would delete dashboard: $dash"
    elif gcloud --quiet --project="$PROJECT" monitoring dashboards delete "$dash" </dev/null >/dev/null 2>&1; then
      ok "  dashboard: $dash"
    else
      fail "  dashboard: $dash"
    fi
  done <<< "$DASH_NAMES"
fi

# Uptime checks: same story — opaque name, displayName-keyed filter.
UPTIME_NAMES="$(gcloud --project="$PROJECT" monitoring uptime list-configs --filter='displayName~^ice-' --format='value(name)' 2>/dev/null || true)"
if [[ -z "$UPTIME_NAMES" ]]; then
  info "  uptime checks: none"
else
  while IFS= read -r uc; do
    [[ -z "$uc" ]] && continue
    if (( DRY_RUN )); then
      info "  would delete uptime check: $uc"
    elif gcloud --quiet --project="$PROJECT" monitoring uptime delete "$uc" </dev/null >/dev/null 2>&1; then
      ok "  uptime check: $uc"
    else
      fail "  uptime check: $uc"
    fi
  done <<< "$UPTIME_NAMES"
fi

# Alert policies + notification channels live behind `gcloud alpha
# monitoring …` which isn't in the default install. Detection has to
# probe a REAL alpha command — `gcloud alpha --help` exits 0 from the
# local docs even when the component isn't installed, so we run a tiny
# alpha command (`policies list --limit=1`) and check stderr for the
# "do not currently have this command group installed" wording. If the
# probe fails, we skip both phases gracefully and tell the user how
# to enable them.
if gcloud --project="$PROJECT" alpha monitoring policies list --limit=1 --format='value(name)' </dev/null >/dev/null 2>&1; then
  delete_each "alert policies" \
    "gcloud --project='$PROJECT' alpha monitoring policies list --filter='displayName~^ice-' --format='value(name)' 2>/dev/null" \
    "alpha monitoring policies delete {}"
  delete_each "notification channels" \
    "gcloud --project='$PROJECT' alpha monitoring channels list --filter='displayName~^ice-' --format='value(name)' 2>/dev/null" \
    "alpha monitoring channels delete {}"
else
  info "  alert policies / notification channels: skipped (run \`gcloud components install alpha\` to enable)"
fi

# ── Phase 5: Secrets ───────────────────────────────────────────────────────
phase "Secret Manager"

delete_each "Secret Manager secrets" \
  "list_with_prefix 'secrets list'" \
  "secrets delete {}"

# ── Phase 6: Networking (VPC last — everything above may reference it) ─────
phase "Networking"

# Firewall rules first (no labels — match by name prefix).
delete_each "firewall rules" \
  "list_with_prefix 'compute firewall-rules list'" \
  "compute firewall-rules delete {}"

# Routes (NAT routes etc.).
delete_each "VPC routes" \
  "list_with_prefix 'compute routes list'" \
  "compute routes delete {}"

# Static IPs (regional + global).
delete_each "global static IPs" \
  "list_with_prefix 'compute addresses list --global'" \
  "compute addresses delete {} --global"

delete_each "regional static IPs (us-central1)" \
  "gcloud --project='$PROJECT' compute addresses list --regions=us-central1 --filter='name~^ice-' --format='value(name)' 2>/dev/null" \
  "compute addresses delete {} --region=us-central1"

# Subnets — must come before VPC delete, must come after anything attached
# to them. Use `--regions=us-central1` (plural) instead of a `--filter`
# expression: the `region:us-central1` filter substring-matches against
# the per-row `region` field and gcloud emits one row per (region, subnet)
# tuple, so the same subnet name appears 30+ times. The plural form
# scopes the listing to a single region cleanly.
delete_each "subnets (us-central1)" \
  "gcloud --project='$PROJECT' compute networks subnets list --regions=us-central1 --filter='name~^ice-' --format='value(name)' 2>/dev/null" \
  "compute networks subnets delete {} --region=us-central1"

# VPCs last.
delete_each "VPC networks" \
  "list_with_prefix 'compute networks list'" \
  "compute networks delete {}"

# ── Phase 7: Local DB cleanup (optional, gated) ────────────────────────────
if (( DELETE_PROJECTS )); then
  phase "Local DB — canvas_project rows"
  DB_PATH="$(pwd)/.desktop-dev.db"
  if [[ ! -f "$DB_PATH" ]]; then
    warn "  $DB_PATH not found — skipping (only run from repo root)"
  elif ! command -v sqlite3 >/dev/null 2>&1; then
    warn "  sqlite3 not found in PATH — skipping DB cleanup"
  else
    BEFORE="$(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM canvas_project' 2>/dev/null || echo '?')"
    info "  canvas_project rows before: $BEFORE"
    if (( DRY_RUN )); then
      info "  would: DELETE FROM canvas_project (cascades to cards, deployments, mappings)"
    else
      # Cascade is configured at the schema level, so a single DELETE FROM
      # canvas_project drops cards, deployments, mappings, environments,
      # block requirement statuses. Wrap in a transaction so a constraint
      # failure rolls back instead of leaving the DB half-wiped.
      if sqlite3 "$DB_PATH" 'BEGIN; DELETE FROM canvas_project; COMMIT;' 2>/dev/null; then
        AFTER="$(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM canvas_project')"
        ok "  canvas_project rows after: $AFTER"
      else
        fail "  failed to delete canvas_project rows"
      fi
    fi
  fi
fi

# ── Verification ───────────────────────────────────────────────────────────
phase "Verification"

if (( DRY_RUN )); then
  info "Dry-run complete — nothing was actually deleted."
  exit 0
fi

# Recount the four most-leaked categories. If any is non-zero, the user
# probably has unlabeled / non-ICE-prefixed leftovers worth checking by
# hand, OR a delete failed (which the ERRORS counter will catch separately).
LEFT_SQL=$(gcloud --project="$PROJECT" sql instances list --filter='name~^ice-' --format='value(name)' 2>/dev/null | grep -c .)
LEFT_REDIS=$(gcloud --project="$PROJECT" redis instances list --region=us-central1 --filter='name~^ice-' --format='value(name)' 2>/dev/null | grep -c .)
LEFT_RUN=$(gcloud --project="$PROJECT" run services list --region=us-central1 --filter='metadata.labels.ice-managed=true' --format='value(metadata.name)' 2>/dev/null | grep -c .)
LEFT_BUCKET=$(gcloud --project="$PROJECT" storage buckets list --filter='name~^ice-' --format='value(name)' 2>/dev/null | grep -c .)
LEFT_AR=$(gcloud --project="$PROJECT" artifacts repositories list --location=us-central1 --filter='name~ice-' --format='value(name)' 2>/dev/null | grep -c .)
LEFT_SINK=$(gcloud --project="$PROJECT" logging sinks list --filter='name~^ice-' --format='value(name)' 2>/dev/null | grep -c .)

REMAINING=$((LEFT_SQL + LEFT_REDIS + LEFT_RUN + LEFT_BUCKET + LEFT_AR + LEFT_SINK))

if (( REMAINING == 0 && ERRORS == 0 )); then
  ok "Project $PROJECT is clean — 0 ICE-labeled resources, 0 errors."
  exit 0
fi

if (( REMAINING > 0 )); then
  warn "Residual ICE-labeled resources detected:"
  warn "  Cloud SQL: $LEFT_SQL · Redis: $LEFT_REDIS · Cloud Run: $LEFT_RUN · Storage buckets: $LEFT_BUCKET"
  warn "  Artifact Registry repos: $LEFT_AR · Log sinks: $LEFT_SINK"
  warn "  Re-run the script, or inspect with:"
  warn "    gcloud --project=$PROJECT sql instances list"
  warn "    gcloud --project=$PROJECT redis instances list --region=us-central1"
  warn "    gcloud --project=$PROJECT run services list --region=us-central1"
  warn "    gcloud --project=$PROJECT storage buckets list"
  warn "    gcloud --project=$PROJECT artifacts repositories list --location=us-central1"
  warn "    gcloud --project=$PROJECT logging sinks list"
fi

if (( ERRORS > 0 )); then
  fail "$ERRORS delete operation(s) failed during this run."
fi

exit 1
