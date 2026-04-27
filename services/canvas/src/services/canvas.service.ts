/**
 * Canvas Service — Business logic for projects/folders/cards
 *
 * Extracted from routes/canvas.ts
 */

import prisma from '@ice/db';
import { bootstrapProductionEnvironment } from './environment.service';

// ── Projects & Folders ──────────────────────────────────────────────────────

export async function listProjects(orgId: string, parentId?: string | null, search?: string) {
  const where: any = { organisation_id: orgId };
  if (parentId !== undefined) {
    where.parent_id = parentId || null;
  }
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  return prisma.canvasProject.findMany({
    where,
    include: {
      cards: { select: { id: true, name: true, updated_at: true } },
      environments: {
        select: { id: true, name: true, type: true, card_id: true, is_protected: true, region: true, pr_number: true },
        orderBy: [{ is_protected: 'desc' }, { created_at: 'asc' }],
      },
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
}

export async function createProject(
  orgId: string,
  userId: string,
  name: string,
  type: string,
  parentId?: string,
  description?: string,
) {
  const projectType = type === 'folder' ? 'folder' : 'project';

  if (parentId) {
    const parent = await prisma.canvasProject.findFirst({
      where: { id: parentId, organisation_id: orgId, type: 'folder' },
    });
    if (!parent) throw new Error('Parent folder not found');
  }

  const slug =
    (name || 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
    '-' +
    Date.now().toString(36);

  const project = await prisma.canvasProject.create({
    data: {
      name: name || (projectType === 'folder' ? 'New Folder' : 'Untitled Project'),
      slug,
      description,
      type: projectType,
      parent_id: parentId || null,
      organisation_id: orgId,
      created_by: userId,
    },
    include: {
      cards: { select: { id: true, name: true, updated_at: true } },
      environments: {
        select: { id: true, name: true, type: true, card_id: true, is_protected: true, region: true, pr_number: true },
      },
    },
  });

  // Auto-create production environment for new projects (not folders)
  if (projectType === 'project') {
    await bootstrapProductionEnvironment(project.id, userId, project.name);
  }

  return project;
}

export async function getProject(projectId: string) {
  const project = await prisma.canvasProject.findFirst({
    where: { id: projectId },
    include: {
      cards: true,
      environments: {
        select: { id: true, name: true, type: true, card_id: true, is_protected: true, region: true, pr_number: true },
        orderBy: [{ is_protected: 'desc' }, { created_at: 'asc' }],
      },
    },
  });
  if (!project) throw new Error('Project not found');
  return project;
}

export async function updateProject(
  projectId: string,
  data: { name?: string; description?: string; provider?: string; region?: string },
) {
  const updates: any = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.provider !== undefined) updates.provider = data.provider;
  if (data.region !== undefined) updates.region = data.region;
  const result = await prisma.canvasProject.updateMany({ where: { id: projectId }, data: updates });
  return { success: result.count > 0 };
}

export async function deleteProject(projectId: string, orgId: string) {
  // Order matters: orphan tables first, then cards, then project.
  //
  // Even though most relations have onDelete: Cascade in the schema, two
  // categories of tables need manual pruning:
  //   1. DeployEvent.deployment_id is NoAction (intentional — we keep the
  //      replay tape past deployment retention). Cascading the delete from
  //      CanvasDeployment would throw FK_CONSTRAINT, so wipe deploy events
  //      by card_id first.
  //   2. DeploymentRule.card_id and AiConversation.{project_id,card_id}
  //      are plain string columns with no @relation declared, so they
  //      don't cascade automatically. Without manual cleanup these orphan
  //      rows would either block delete (if the schema enforces FK) or
  //      pile up forever as zombie data (if it doesn't).
  //
  // Wrap everything in a transaction so a partial failure rolls back
  // instead of leaving the project in a half-deleted state.
  async function collectCardIds(rootProjectId: string): Promise<string[]> {
    const cardIds: string[] = [];
    async function walk(id: string) {
      const children = await prisma.canvasProject.findMany({
        where: { parent_id: id, organisation_id: orgId },
        select: { id: true },
      });
      for (const child of children) await walk(child.id);
      const cards = await prisma.canvasCard.findMany({
        where: { project_id: id },
        select: { id: true },
      });
      for (const c of cards) cardIds.push(c.id);
    }
    await walk(rootProjectId);
    return cardIds;
  }
  async function collectProjectIds(rootProjectId: string): Promise<string[]> {
    const ids: string[] = [];
    async function walk(id: string) {
      ids.push(id);
      const children = await prisma.canvasProject.findMany({
        where: { parent_id: id, organisation_id: orgId },
        select: { id: true },
      });
      for (const child of children) await walk(child.id);
    }
    await walk(rootProjectId);
    return ids;
  }

  const cardIds = await collectCardIds(projectId);
  const projectIds = await collectProjectIds(projectId);

  await prisma.$transaction(async (tx) => {
    if (cardIds.length > 0) {
      await tx.deployEvent.deleteMany({ where: { card_id: { in: cardIds } } });
      await tx.deploymentRule.deleteMany({ where: { card_id: { in: cardIds } } });
    }
    await tx.aiConversation.deleteMany({ where: { project_id: { in: projectIds } } });

    // Recursive cascade for the project tree itself. Children first so
    // each parent.delete sees no dependents.
    async function deleteSubtree(id: string) {
      const children = await tx.canvasProject.findMany({
        where: { parent_id: id, organisation_id: orgId },
        select: { id: true },
      });
      for (const c of children) await deleteSubtree(c.id);
      await tx.canvasCard.deleteMany({ where: { project_id: id } });
      await tx.canvasProject.delete({ where: { id } });
    }
    await deleteSubtree(projectId);
  });
}

export async function moveProject(projectId: string, parentId: string | null, orgId?: string) {
  if (parentId) {
    // Validate target parent belongs to the same org
    if (orgId) {
      const parent = await prisma.canvasProject.findFirst({
        where: { id: parentId, organisation_id: orgId, type: 'folder' },
      });
      if (!parent) throw new Error('Target folder not found or belongs to a different organisation');
    }

    async function isDescendant(folderId: string, targetId: string): Promise<boolean> {
      if (folderId === targetId) return true;
      const children = await prisma.canvasProject.findMany({
        where: { parent_id: folderId, type: 'folder' },
        select: { id: true },
      });
      for (const child of children) {
        if (await isDescendant(child.id, targetId)) return true;
      }
      return false;
    }
    if (await isDescendant(projectId, parentId)) {
      throw new Error('Cannot move folder into its own descendant');
    }
  }

  await prisma.canvasProject.update({
    where: { id: projectId },
    data: { parent_id: parentId || null },
  });
}

// ── Cards ───────────────────────────────────────────────────────────────────

export async function createCard(projectId: string | undefined, orgId: string, userId: string, name?: string) {
  let pid = projectId;
  if (!pid) {
    const defaultProject = await prisma.canvasProject.create({
      data: {
        name: name || 'Untitled',
        slug: 'untitled-' + Date.now().toString(36),
        type: 'project',
        organisation_id: orgId,
        created_by: userId,
      },
    });
    pid = defaultProject.id;
  }

  return prisma.canvasCard.create({
    data: { name: name || 'Untitled Card', project_id: pid, nodes: [], edges: [] },
  });
}

export async function getCard(cardId: string) {
  const card = await prisma.canvasCard.findUnique({ where: { id: cardId } });
  if (!card) throw new Error('Card not found');
  return card;
}

export async function updateCard(cardId: string, data: { name?: string; nodes?: any; edges?: any; viewport?: any }) {
  const updates: any = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.nodes !== undefined) updates.nodes = data.nodes;
  if (data.edges !== undefined) updates.edges = data.edges;
  if (data.viewport !== undefined) updates.viewport = data.viewport;
  return prisma.canvasCard.update({ where: { id: cardId }, data: updates });
}

export async function deleteCard(cardId: string) {
  await prisma.canvasCard.delete({ where: { id: cardId } });
}
