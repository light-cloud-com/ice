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
  async function deleteRecursive(id: string) {
    const children = await prisma.canvasProject.findMany({
      where: { parent_id: id, organisation_id: orgId },
    });
    for (const child of children) await deleteRecursive(child.id);
    await prisma.canvasCard.deleteMany({ where: { project_id: id } });
    await prisma.canvasProject.delete({ where: { id } });
  }

  await deleteRecursive(projectId);
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
