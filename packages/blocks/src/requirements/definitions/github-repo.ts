/**
 * Requirement: Compute blocks need a GitHub repository attached.
 *
 * Applies to: Static Site, SSR Site, Container, Backend API blocks.
 * Blocking before-deploy. The check runs against the block's own `data`,
 * not against the live GitHub API — reachability is a separate concern and
 * can be layered in as a second requirement if we want it.
 */

import type { RequirementDefinition } from '../types';

const COMPUTE_TYPES_WITH_SOURCE = new Set([
  'Compute.StaticSite',
  'Compute.SSRSite',
  'Compute.Container',
  'Compute.BackendAPI',
  'Compute.Worker',
  'Compute.ServerlessFunction',
]);

export const githubRepoAttachedRequirement: RequirementDefinition = {
  id: 'github-repo-attached',
  scope: 'block',
  timing: 'before-deploy',
  blocking: true,
  applies: (ctx) => {
    const iceType = ctx.block.data?.iceType as string | undefined;
    return Boolean(iceType && COMPUTE_TYPES_WITH_SOURCE.has(iceType));
  },
  title: () => 'Attach a source repository',
  description: (ctx) => {
    const iceType = ctx.block.data?.iceType as string | undefined;
    if (iceType === 'Compute.StaticSite') {
      return 'This block needs source files to deploy. Connect a GitHub repository so ICE can fetch the built static output and upload it to the bucket.';
    }
    if (iceType === 'Compute.ServerlessFunction') {
      return 'This block needs source code to deploy. Connect a GitHub repository so ICE can package the function and upload it.';
    }
    return 'This block needs source code to deploy. Connect a GitHub repository so ICE can build and deploy it.';
  },
  check: async (ctx) => {
    const now = new Date().toISOString();
    // Accept either a structured `source` object or legacy top-level `repository`/`repo`/`github` fields.
    const source = ctx.block.data?.source as
      | { repo?: string; branch?: string }
      | undefined;
    const legacyRepo =
      (ctx.block.data?.repository as string | undefined) ||
      (ctx.block.data?.repo as string | undefined) ||
      (ctx.block.data?.github as string | undefined);

    const repo = source?.repo || legacyRepo;
    if (!repo) {
      return {
        status: 'unmet',
        message: 'No repository selected.',
        lastCheckedAt: now,
      };
    }
    // Basic sanity: must look like `owner/repo`.
    if (!/^[^/]+\/[^/]+$/.test(repo)) {
      return {
        status: 'unmet',
        message: `"${repo}" is not a valid repository reference (expected owner/repo).`,
        lastCheckedAt: now,
      };
    }
    return {
      status: 'met',
      message: `Using ${repo}${source?.branch ? `@${source.branch}` : ''}`,
      lastCheckedAt: now,
    };
  },
  action: (ctx) => {
    const source = ctx.block.data?.source as { repo?: string } | undefined;
    const hasRepo =
      Boolean(source?.repo) ||
      Boolean(ctx.block.data?.repository) ||
      Boolean(ctx.block.data?.repo) ||
      Boolean(ctx.block.data?.github);
    if (!hasRepo) {
      return {
        type: 'attach-repo',
        label: 'Attach repository',
        payload: { blockId: ctx.block.id },
      };
    }
    return {
      type: 'install-github-app',
      label: 'Install GitHub App',
      payload: { repo: source?.repo },
    };
  },
};
