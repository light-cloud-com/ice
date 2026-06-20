#!/usr/bin/env node
// One-command release for ICE.
//
//   node scripts/release.mjs 0.1.900     # explicit version
//   node scripts/release.mjs patch       # or minor / major
//   pnpm release 0.1.900
//
// Runs the whole pipeline, and is RESUMABLE — if it stops partway (CI, network,
// a build hiccup), just run the same command again and it picks up where it
// left off (it detects the existing branch / PR / tag / release and skips the
// steps already done):
//   1. Preflight (fresh start only): gh authed, clean `main` matching origin.
//   2. Bump the version in BOTH package.json files (root + apps/desktop) on a
//      release branch, open a PR, wait for CI, squash-merge.
//   3. Tag the merged commit and push → triggers the "Release desktop" workflow.
//   4. Wait for the macOS/Windows/Linux builds + the draft release to finish.
//   5. Notarize the macOS DMGs (scripts/notarize-release.mjs) WHILE the release
//      is still a DRAFT — "Immutable releases" freezes assets at publish time,
//      so the stapled DMGs must be in place BEFORE un-drafting.
//   6. Publish the release (un-draft) — captures the notarized assets.
//
// Why both package.json files: electron-builder reads apps/desktop/package.json
// for the version it stamps into artifact names (ICE-Setup-<version>.exe) and
// the GitHub release tag it publishes to. The git tag we push and that version
// MUST match, so we keep root and desktop versions in lockstep. (Today they have
// drifted — root 0.1.899 vs desktop 0.1.0 — and the first release through this
// script realigns them.)
//
// macOS binaries are Developer ID code-signed in CI; notarization runs locally
// (Pattern C) via scripts/notarize-release.mjs, so CI never blocks on Apple's
// notary queue. Windows ships unsigned (SmartScreen) until an EV cert lands.
//
// Prerequisites (one-time):
//   - `gh` authenticated with write access to the repo.
//   - macOS notary keychain profile "ice-notary" (see notarize-release.mjs).
//   - CI secrets CSC_LINK / CSC_KEY_PASSWORD set on the repo (signing cert).
//   - Use a NEW version each time — bump forward, never reuse a released tag.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "light-cloud-com/ice";
const WORKFLOW = "Release desktop"; // matches .github/workflows/release.yml `name:`
const projectRoot = resolve(fileURLToPath(import.meta.url), "..", "..");

// package.json files whose "version" we keep in lockstep with the release tag.
const VERSIONED_MANIFESTS = ["package.json", "apps/desktop/package.json"];

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd: projectRoot, ...opts });
  if (res.status !== 0) throw new Error(`${cmd} exited with code ${res.status}`);
  return res;
}

function capture(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: projectRoot, encoding: "utf8" });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${res.stderr || ""}`);
  return res.stdout.trim();
}

// Returns trimmed stdout, or null if the command failed (non-fatal probe).
function tryCapture(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: projectRoot, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : null;
}

function ghJson(args) {
  const out = tryCapture("gh", args);
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function sleep(seconds) {
  spawnSync("sleep", [String(seconds)], { stdio: "ignore" });
}

function currentVersion() {
  return JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")).version;
}

// Resolve "1.2.3" | "patch" | "minor" | "major" → "1.2.3"
function resolveVersion(arg) {
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg;
  const [maj, min, pat] = currentVersion().split(".").map(Number);
  if (arg === "major") return `${maj + 1}.0.0`;
  if (arg === "minor") return `${maj}.${min + 1}.0`;
  if (arg === "patch") return `${maj}.${min}.${pat + 1}`;
  fail(`Invalid version "${arg}" — use a semver like 0.1.900, or patch/minor/major.`);
}

// Rewrite the top-level "version" field in each manifest, preserving formatting
// by touching only the version line.
function bumpManifests(version) {
  for (const rel of VERSIONED_MANIFESTS) {
    const path = join(projectRoot, rel);
    const src = readFileSync(path, "utf8");
    const next = src.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
    if (next === src) fail(`Could not find a "version" field to bump in ${rel}.`);
    writeFileSync(path, next);
    console.log(`  • ${rel} → ${version}`);
  }
}

// Wait for the PR's CI to pass. Robust against the gap right after a PR is
// created, when `gh pr checks --watch` errors with "no checks reported" instead
// of waiting — we just retry until the checks register, then it blocks to the end.
function waitForChecks(branch) {
  console.log("\n⏳ Waiting for CI checks (retries until they register)…");
  for (let i = 0; i < 120; i++) {
    const res = spawnSync("gh", ["pr", "checks", branch, "--repo", REPO, "--watch", "--fail-fast"], {
      cwd: projectRoot,
      encoding: "utf8",
    });
    const text = (res.stdout || "") + (res.stderr || "");
    if (res.status === 0) {
      process.stdout.write(res.stdout || "");
      return;
    }
    if (/no checks reported/i.test(text)) {
      sleep(8);
      continue;
    }
    process.stdout.write(res.stdout || "");
    process.stderr.write(res.stderr || "");
    fail("CI checks did not pass — fix them, push to the branch, and re-run.");
  }
  fail("Timed out waiting for CI checks to register.");
}

// Squash-merge the PR. Prefer a plain merge; fall back to --admin if branch
// protection blocks it (and the maintainer holds an admin bypass).
function mergePr(branch) {
  const base = ["pr", "merge", branch, "--repo", REPO, "--squash", "--delete-branch"];
  const plain = spawnSync("gh", base, { cwd: projectRoot, encoding: "utf8" });
  if (plain.status === 0) {
    process.stdout.write(plain.stdout || "");
    return;
  }
  process.stderr.write(plain.stderr || "");
  console.log("• Plain squash-merge was blocked — retrying with --admin bypass…");
  run("gh", [...base, "--admin"]);
}

function pushTag(tag) {
  console.log(`\nPushing tag ${tag}…`);
  const res = spawnSync("git", ["push", "origin", tag], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["inherit", "inherit", "pipe"],
  });
  if (res.status === 0) return;
  process.stderr.write(res.stderr || "");
  fail(`git push of tag ${tag} failed. If the tag already exists remotely from a previous attempt, delete it (git push origin :${tag}) or bump to a new version.`);
}

// ---- main -------------------------------------------------------------------

const arg = process.argv[2];
if (!arg) fail("Usage: node scripts/release.mjs <version|patch|minor|major>");

const version = resolveVersion(arg);
const tag = `v${version}`;
const branch = `release-${tag}`;

console.log(`\n=== Releasing ${tag} (current: ${currentVersion()}) ===`);

if (spawnSync("gh", ["auth", "status"], { stdio: "ignore" }).status !== 0) {
  fail("GitHub CLI not authenticated. Run: gh auth login");
}

// Detect what already exists, so a re-run resumes instead of starting over.
const tagOnRemote = !!tryCapture("git", ["ls-remote", "--tags", "origin", tag]);
const release = ghJson(["release", "view", tag, "--repo", REPO, "--json", "isDraft,assets"]);
const prInfo = ghJson(["pr", "view", branch, "--repo", REPO, "--json", "state"]);
const prState = prInfo ? prInfo.state : null; // OPEN | MERGED | CLOSED | null

// ---- Stage A: get the version bump merged into main -------------------------
const bumpMerged = tagOnRemote || release !== null || prState === "MERGED";

if (bumpMerged) {
  console.log("• Version bump already merged — resuming at the tag/build stage.");
} else {
  const branchPushed = !!tryCapture("git", ["ls-remote", "--heads", "origin", branch]);

  if (!branchPushed) {
    // Fresh start — require a clean main that matches origin.
    const onBranch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (onBranch !== "main") fail(`Switch to main first (on "${onBranch}").`);
    if (capture("git", ["status", "--porcelain"]))
      fail("Working tree is not clean — commit or stash first.");
    run("git", ["fetch", "origin", "main", "--quiet"]);
    if (capture("git", ["rev-parse", "main"]) !== capture("git", ["rev-parse", "origin/main"]))
      fail("Local main differs from origin/main. Run: git pull --ff-only");

    run("git", ["checkout", "-b", branch]);
    console.log(`\nBumping version → ${version}:`);
    bumpManifests(version);
    run("git", ["commit", "-am", `release: ${version}`]);
    run("git", ["push", "-u", "origin", branch]);
  } else {
    console.log("• Release branch already pushed — resuming (skipping the version bump).");
  }

  if (prState !== "OPEN") {
    run("gh", [
      "pr", "create", "--repo", REPO, "--base", "main", "--head", branch,
      "--title", `release: ${version}`, "--body", `Release ${tag}.`,
    ]);
  } else {
    console.log(`• PR for ${branch} already open — reusing it.`);
  }

  waitForChecks(branch);
  mergePr(branch);
}

// ---- Stage B: tag the merged commit → triggers the build --------------------
run("git", ["checkout", "main"]);
run("git", ["pull", "--ff-only", "origin", "main"]);
if (!tagOnRemote) {
  if (!tryCapture("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`])) {
    run("git", ["tag", tag]);
  }
  pushTag(tag);
} else {
  console.log(`• Tag ${tag} already on origin — skipping tag push.`);
}

// ---- Stage C: wait for the Release build (skip if assets already present) ---
const built = ghJson(["release", "view", tag, "--repo", REPO, "--json", "assets"]);
if (!built || (built.assets || []).length === 0) {
  console.log("\n⏳ Waiting for the Release build to start…");
  let runId = null;
  for (let i = 0; i < 20 && !runId; i++) {
    sleep(6);
    const runs = ghJson([
      "run", "list", "--repo", REPO, "--workflow", WORKFLOW,
      "--branch", tag, "--json", "databaseId", "--limit", "1",
    ]);
    if (runs && runs.length) runId = runs[0].databaseId;
  }
  if (!runId)
    fail(`Couldn't find the "${WORKFLOW}" run for ${tag}. Check the Actions tab, then re-run this script.`);
  console.log(`\n⏳ Building (run ${runId}) — the slow part (~10–15 min across 3 platforms)…`);
  run("gh", ["run", "watch", String(runId), "--repo", REPO, "--exit-status"]);
} else {
  console.log(`• Build artifacts already attached to ${tag} — skipping the build wait.`);
}

// ---- Stage D: notarize the macOS DMGs WHILE STILL A DRAFT -------------------
// CI ships signed-but-not-notarized DMGs (Pattern C) so it never blocks on
// Apple's notary queue. Notarize + staple + re-upload now, while the release is
// still a draft: GitHub "Immutable releases" freezes a release's assets at
// publish (un-draft) time, so the stapled DMGs must be in place BEFORE we flip
// it live. notarize-release.mjs is idempotent (skips already-stapled DMGs).
run("node", [join(projectRoot, "scripts", "notarize-release.mjs"), tag]);

// ---- Stage E: publish (un-draft) — idempotent; freezes the stapled assets ---
// electron-builder publishes to a DRAFT GitHub release by default; flip it live.
run("gh", ["release", "edit", tag, "--repo", REPO, "--draft=false"]);

console.log(`\n✅ Released ${tag}: https://github.com/${REPO}/releases/tag/${tag}`);
