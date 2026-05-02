/**
 * Project Access Service
 *
 * Checks and manages project-level permissions.
 * Org admins/owners bypass project checks (full access).
 * Org members/viewers need explicit ProjectMember records.
 */

import prisma from '@ice/db';

const ROLE_LEVEL: Record<string, number> = { viewer: 1, editor: 2, owner: 3 };
const ORG_ADMIN_ROLES = new Set(['owner', 'admin']);

async function getOrgRole(userId: string, orgId: string): Promise<string | null> {
  const member = await prisma.organisationMember.findUnique({
    where: { user_id_organisation_id: { user_id: userId, organisation_id: orgId } },
  });
  return member?.role || null;
}

async function getProjectRole(userId: string, projectId: string): Promise<string | null> {
  const pm = await prisma.projectMember.findUnique({
    where: { project_id_user_id: { project_id: projectId, user_id: userId } },
  });
  return pm?.role || null;
}

export async function hasProjectAccess(
  userId: string,
  projectId: string,
  minRole: 'viewer' | 'editor' | 'owner',
): Promise<boolean> {
  // Get the project's org to check org-level role
  const project = await prisma.canvasProject.findUnique({
    where: { id: projectId },
    select: { organisation_id: true },
  });
  if (!project) return false;

  // Org admins/owners always have full access
  const orgRole = await getOrgRole(userId, project.organisation_id);
  if (orgRole && ORG_ADMIN_ROLES.has(orgRole)) return true;

  // Check project-level membership
  const projectRole = await getProjectRole(userId, projectId);
  if (!projectRole) return false;

  return (ROLE_LEVEL[projectRole] || 0) >= (ROLE_LEVEL[minRole] || 0);
}

export async function grantCreatorAccess(projectId: string, userId: string): Promise<void> {
  await prisma.projectMember.upsert({
    where: { project_id_user_id: { project_id: projectId, user_id: userId } },
    update: { role: 'owner' },
    create: { project_id: projectId, user_id: userId, role: 'owner', granted_by: userId },
  });
}

export async function listProjectMembers(projectId: string) {
  return prisma.projectMember.findMany({
    where: { project_id: projectId },
    include: { user: { select: { id: true, email: true, name: true, avatar: true } } },
    orderBy: { granted_at: 'asc' },
  });
}

export async function addProjectMember(projectId: string, userId: string, role: string, grantedBy: string) {
  return prisma.projectMember.upsert({
    where: { project_id_user_id: { project_id: projectId, user_id: userId } },
    update: { role },
    create: { project_id: projectId, user_id: userId, role, granted_by: grantedBy },
  });
}

export async function updateProjectMemberRole(projectId: string, userId: string, newRole: string) {
  // findings.md #6 — block demotion of the last owner. Without this
  // an owner could update-role-themselves to "editor" and leave the
  // project unmanageable. (Self-update is also blocked at the route
  // layer, but other owners could still demote them; this guard is
  // the one consistent layer that fires regardless of caller.)
  if (newRole !== 'owner' && (await isLastOwner(projectId, userId))) {
    throw new Error('Cannot demote the last project owner');
  }
  return prisma.projectMember.update({
    where: { project_id_user_id: { project_id: projectId, user_id: userId } },
    data: { role: newRole },
  });
}

export async function removeProjectMember(projectId: string, userId: string) {
  // Don't allow removing the last owner
  if (await isLastOwner(projectId, userId)) {
    throw new Error('Cannot remove the last project owner');
  }
  return prisma.projectMember.delete({
    where: { project_id_user_id: { project_id: projectId, user_id: userId } },
  });
}

async function isLastOwner(projectId: string, userId: string): Promise<boolean> {
  const pm = await prisma.projectMember.findUnique({
    where: { project_id_user_id: { project_id: projectId, user_id: userId } },
  });
  if (pm?.role !== 'owner') return false;

  const ownerCount = await prisma.projectMember.count({
    where: { project_id: projectId, role: 'owner' },
  });
  return ownerCount <= 1;
}
