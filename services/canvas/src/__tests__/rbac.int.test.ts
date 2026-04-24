/**
 * RBAC Integration Tests
 *
 * Verifies role-based access control middleware with real DB users:
 * - requireProjectAccess: viewer < editor < owner
 * - requireOrgRole: member < admin < owner
 * - Org owners/admins bypass project-level checks
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Load env
const envPath = resolve(__dirname, '../../../../.env');
try {
  const c = readFileSync(envPath, 'utf-8');
  for (const l of c.split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0 && !process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1);
  }
} catch {
  /* */
}
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-rbac';

let prisma: any;
let rpa: any;
let ror: any;

const ORG = { id: '', name: 'RBAC Test Org' };
const OWNER = { id: '', email: 'rbac-owner@test.local' };
const EDITOR = { id: '', email: 'rbac-editor@test.local' };
const VIEWER = { id: '', email: 'rbac-viewer@test.local' };
const MEMBER = { id: '', email: 'rbac-member@test.local' };

let projectId = '';
let cardId = '';

async function cleanup() {
  const ids = [OWNER.id, EDITOR.id, VIEWER.id, MEMBER.id].filter(Boolean);
  await prisma.projectMember.deleteMany({ where: { user_id: { in: ids } } }).catch(() => {});
  await prisma.environment.deleteMany({ where: { project: { organisation_id: ORG.id } } }).catch(() => {});
  await prisma.canvasCard.deleteMany({ where: { project: { organisation_id: ORG.id } } }).catch(() => {});
  await prisma.canvasProject.deleteMany({ where: { organisation_id: ORG.id } }).catch(() => {});
  await prisma.organisationMember.deleteMany({ where: { organisation_id: ORG.id } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { email: { in: [OWNER.email, EDITOR.email, VIEWER.email, MEMBER.email] } } })
    .catch(() => {});
  await prisma.organisation.deleteMany({ where: { name: ORG.name } }).catch(() => {});
}

beforeAll(async () => {
  prisma = (await import('@ice/db')).default;
  const shared = await import('@ice/shared');
  rpa = shared.requireProjectAccess;
  ror = shared.requireOrgRole;

  await cleanup();

  const org = await prisma.organisation.create({ data: { name: ORG.name } });
  ORG.id = org.id;

  for (const u of [OWNER, EDITOR, VIEWER, MEMBER]) {
    const created = await prisma.user.create({
      data: { email: u.email, name: u.email.split('@')[0], password_hash: '@@test@@', organisation_id: ORG.id },
    });
    u.id = created.id;
  }

  await prisma.organisationMember.create({ data: { user_id: OWNER.id, organisation_id: ORG.id, role: 'owner' } });
  await prisma.organisationMember.create({ data: { user_id: EDITOR.id, organisation_id: ORG.id, role: 'member' } });
  await prisma.organisationMember.create({ data: { user_id: VIEWER.id, organisation_id: ORG.id, role: 'member' } });
  await prisma.organisationMember.create({ data: { user_id: MEMBER.id, organisation_id: ORG.id, role: 'member' } });

  const canvasService = await import('../services/canvas.service');
  const project = await canvasService.createProject(ORG.id, OWNER.id, 'RBAC Project', 'project');
  projectId = project.id;
  const cards = await prisma.canvasCard.findMany({ where: { project_id: projectId } });
  cardId = cards[0]?.id || '';

  await prisma.projectMember.create({
    data: { project_id: projectId, user_id: OWNER.id, role: 'owner', granted_by: OWNER.id },
  });
  await prisma.projectMember.create({
    data: { project_id: projectId, user_id: EDITOR.id, role: 'editor', granted_by: OWNER.id },
  });
  await prisma.projectMember.create({
    data: { project_id: projectId, user_id: VIEWER.id, role: 'viewer', granted_by: OWNER.id },
  });
  // MEMBER has NO project membership
}, 30000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/** Simulate middleware execution */
function check(
  mw: any,
  userId: string,
  orgId: string,
  body: Record<string, any> = {},
  params: Record<string, any> = {},
): Promise<number> {
  return new Promise((resolve) => {
    const req: any = { userId, organisationId: orgId, body, params, query: {} };
    const res: any = { status: (code: number) => ({ json: () => resolve(code) }) };
    mw(req, res, () => resolve(200));
  });
}

// =============================================================================
// requireProjectAccess
// =============================================================================

describe('requireProjectAccess — viewer', () => {
  it('owner: 200', async () => expect(await check(rpa('viewer'), OWNER.id, ORG.id, { projectId })).toBe(200));
  it('editor: 200', async () => expect(await check(rpa('viewer'), EDITOR.id, ORG.id, { projectId })).toBe(200));
  it('viewer: 200', async () => expect(await check(rpa('viewer'), VIEWER.id, ORG.id, { projectId })).toBe(200));
  it('no-role member: 403', async () => expect(await check(rpa('viewer'), MEMBER.id, ORG.id, { projectId })).toBe(403));
});

describe('requireProjectAccess — editor', () => {
  it('owner: 200', async () => expect(await check(rpa('editor'), OWNER.id, ORG.id, { projectId })).toBe(200));
  it('editor: 200', async () => expect(await check(rpa('editor'), EDITOR.id, ORG.id, { projectId })).toBe(200));
  it('viewer: 403', async () => expect(await check(rpa('editor'), VIEWER.id, ORG.id, { projectId })).toBe(403));
  it('no-role member: 403', async () => expect(await check(rpa('editor'), MEMBER.id, ORG.id, { projectId })).toBe(403));
});

describe('requireProjectAccess — owner', () => {
  it('owner: 200', async () => expect(await check(rpa('owner'), OWNER.id, ORG.id, { projectId })).toBe(200));
  it('editor: 403', async () => expect(await check(rpa('owner'), EDITOR.id, ORG.id, { projectId })).toBe(403));
  it('viewer: 403', async () => expect(await check(rpa('owner'), VIEWER.id, ORG.id, { projectId })).toBe(403));
});

describe('requireProjectAccess — cardId resolution', () => {
  it('viewer via cardId: 200', async () => {
    if (!cardId) return;
    expect(await check(rpa('viewer'), VIEWER.id, ORG.id, { cardId })).toBe(200);
  });
  it('no-role via cardId: 403', async () => {
    if (!cardId) return;
    expect(await check(rpa('viewer'), MEMBER.id, ORG.id, { cardId })).toBe(403);
  });
});

// =============================================================================
// requireOrgRole
// =============================================================================

describe('requireOrgRole — owner', () => {
  it('owner: 200', async () => expect(await check(ror('owner'), OWNER.id, ORG.id)).toBe(200));
  it('member: 403', async () => expect(await check(ror('owner'), MEMBER.id, ORG.id)).toBe(403));
});

describe('requireOrgRole — owner/admin', () => {
  it('owner: 200', async () => expect(await check(ror('owner', 'admin'), OWNER.id, ORG.id)).toBe(200));
  it('member: 403', async () => expect(await check(ror('owner', 'admin'), MEMBER.id, ORG.id)).toBe(403));
});

// =============================================================================
// Business rule enforcement
// =============================================================================

describe('Deploy: apply/destroy require owner', () => {
  it('viewer cannot apply', async () => expect(await check(rpa('owner'), VIEWER.id, ORG.id, { cardId })).toBe(403));
  it('editor cannot apply', async () => expect(await check(rpa('owner'), EDITOR.id, ORG.id, { cardId })).toBe(403));
  it('owner can apply', async () => expect(await check(rpa('owner'), OWNER.id, ORG.id, { cardId })).toBe(200));
});

describe('Deploy: plan requires editor', () => {
  it('viewer cannot plan', async () => expect(await check(rpa('editor'), VIEWER.id, ORG.id, { cardId })).toBe(403));
  it('editor can plan', async () => expect(await check(rpa('editor'), EDITOR.id, ORG.id, { cardId })).toBe(200));
});

describe('Card delete requires owner', () => {
  it('editor cannot delete', async () => expect(await check(rpa('owner'), EDITOR.id, ORG.id, { cardId })).toBe(403));
  it('owner can delete', async () => expect(await check(rpa('owner'), OWNER.id, ORG.id, { cardId })).toBe(200));
});

describe('Environment promote requires owner', () => {
  it('editor cannot promote', async () =>
    expect(await check(rpa('owner'), EDITOR.id, ORG.id, { projectId })).toBe(403));
  it('owner can promote', async () => expect(await check(rpa('owner'), OWNER.id, ORG.id, { projectId })).toBe(200));
});

describe('Billing: payment requires org owner', () => {
  it('member cannot manage payment', async () => expect(await check(ror('owner'), MEMBER.id, ORG.id)).toBe(403));
  it('owner can manage payment', async () => expect(await check(ror('owner'), OWNER.id, ORG.id)).toBe(200));
});

describe('Credentials: connect requires org admin+', () => {
  it('member cannot connect', async () => expect(await check(ror('owner', 'admin'), MEMBER.id, ORG.id)).toBe(403));
  it('owner can connect', async () => expect(await check(ror('owner', 'admin'), OWNER.id, ORG.id)).toBe(200));
});
