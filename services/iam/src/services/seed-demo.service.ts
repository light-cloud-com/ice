/**
 * Seed Demo Service
 *
 * Bootstraps a representative ACME SaaS project (folder "acme" →
 * project "acme_example" with a single canvas card pre-filled with
 * frontend + private-network microservice + observability) so a
 * fresh workspace isn't an empty page.
 *
 * Two entry points:
 *   - `seedDemoIfEmpty` — call from gateway boot. No-op when the user
 *     already has any canvas project, so subsequent restarts don't
 *     keep re-seeding.
 *   - `seedAcmeDemo` — call from the reset-workspace endpoint, AFTER
 *     the wipe, so the user lands on a fresh-but-not-blank canvas.
 *
 * The seed composition lives at `seed-data/acme-example.ts` and uses
 * the `ComposedTemplate` shape so we can reuse the templates
 * package's `expandComposedTemplate` engine — same expansion the
 * gallery uses, but without surfacing the seed in the gallery.
 *
 * Three rows per seed (folder + project + card) PLUS a production
 * Environment row pointing at the card. Without the Environment the
 * canvas loader can't resolve the project's default card and the
 * env-tab-bar renders empty — so the env is part of the atomic seed,
 * not bolted on after.
 */

import { PrismaClient } from '@ice/db';
import { expandComposedTemplate } from '@ice/templates';
import { acmeExampleSeed } from './seed-data/acme-example';
import type { Provider } from '@ice/blocks';

type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const ACME_FOLDER_NAME = 'acme';
const ACME_PROJECT_NAME = 'acme_example';

interface SeedResult {
  folderId: string;
  projectId: string;
  cardId: string;
  environmentId: string;
}

function uniqueSlug(base: string): string {
  return `${base}-${Date.now().toString(36)}`;
}

export async function seedAcmeDemo(prisma: PrismaClient, userId: string, orgId: string): Promise<SeedResult | null> {
  if (!orgId) return null;

  const provider = (acmeExampleSeed.provider as Provider | undefined) ?? 'gcp';
  const expanded = expandComposedTemplate(acmeExampleSeed, provider);

  // Re-serialize to strip any non-JSON values (functions, undefined,
  // Maps) that may have crept in via blueprint defaults. Without this
  // a single bad property anywhere in the tree can corrupt the JSON
  // column and crash the canvas on load with `.map is not a function`.
  const nodes = JSON.parse(JSON.stringify(expanded.nodes)) as unknown[];
  const edges = JSON.parse(JSON.stringify(expanded.edges)) as unknown[];

  return prisma.$transaction(async (tx: PrismaTx) => {
    const folder = await tx.canvasProject.create({
      data: {
        name: ACME_FOLDER_NAME,
        slug: uniqueSlug(ACME_FOLDER_NAME),
        type: 'folder',
        organisation_id: orgId,
        created_by: userId,
      },
    });

    const project = await tx.canvasProject.create({
      data: {
        name: ACME_PROJECT_NAME,
        slug: uniqueSlug(ACME_PROJECT_NAME),
        type: 'project',
        organisation_id: orgId,
        created_by: userId,
        parent_id: folder.id,
        provider,
        region: 'us-central1',
      },
    });

    const card = await tx.canvasCard.create({
      data: {
        name: `${ACME_PROJECT_NAME} — Production`,
        project_id: project.id,
        nodes: nodes as never,
        edges: edges as never,
      },
    });

    // Production environment pointing at the card. The 1:1 unique on
    // Environment.card_id means this row is what makes the project
    // navigable from the env tab bar.
    const environment = await tx.environment.create({
      data: {
        project_id: project.id,
        card_id: card.id,
        name: 'production',
        type: 'production',
        region: 'us-central1',
        is_protected: true,
        created_by: userId,
      },
    });

    return { folderId: folder.id, projectId: project.id, cardId: card.id, environmentId: environment.id };
  });
}

export async function seedDemoIfEmpty(prisma: PrismaClient, userId: string, orgId: string): Promise<SeedResult | null> {
  if (!orgId) return null;

  const existing = await prisma.canvasProject.count({
    where: { organisation_id: orgId, type: 'project' },
  });
  if (existing > 0) return null;

  try {
    return await seedAcmeDemo(prisma, userId, orgId);
  } catch (err) {
    console.error('[seed-demo] failed to seed acme example:', err);
    return null;
  }
}
