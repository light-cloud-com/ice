/**
 * Organisation Isolation Tests
 *
 * Verifies that projects, folders, cards, and environments are properly
 * scoped to organisations. Users in Org A must not see or modify
 * resources belonging to Org B.
 *
 * Tests are service-level (direct function calls against the DB) to avoid
 * external dependencies like supertest.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ── Test environment ────────────────────────────────────────────────────────

const envPath = resolve(__dirname, '../../../../.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env not found
}
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-org-isolation';

// ── Helpers ─────────────────────────────────────────────────────────────────

let prisma: any;
let canvasService: typeof import('../services/canvas.service');
let envService: any;

const ORG_A = { id: '', name: 'Test Org Alpha' };
const ORG_B = { id: '', name: 'Test Org Beta' };
const USER_A = { id: '', email: 'orgtest-a@test.local' };
const USER_B = { id: '', email: 'orgtest-b@test.local' };

let projectA: any;
let projectB: any;
let folderA: any;
let folderB: any;

// ── Setup & Teardown ────────────────────────────────────────────────────────

async function cleanup() {
  // Delete in dependency order
  await prisma.projectMember.deleteMany({
    where: { user_id: { in: [USER_A.id, USER_B.id].filter(Boolean) } },
  }).catch(() => {});
  await prisma.environment.deleteMany({
    where: { project: { organisation_id: { in: [ORG_A.id, ORG_B.id].filter(Boolean) } } },
  }).catch(() => {});
  await prisma.canvasCard.deleteMany({
    where: { project: { organisation_id: { in: [ORG_A.id, ORG_B.id].filter(Boolean) } } },
  }).catch(() => {});
  await prisma.canvasProject.deleteMany({
    where: { organisation_id: { in: [ORG_A.id, ORG_B.id].filter(Boolean) } },
  }).catch(() => {});
  await prisma.organisationMember.deleteMany({
    where: { organisation_id: { in: [ORG_A.id, ORG_B.id].filter(Boolean) } },
  }).catch(() => {});
  await prisma.user.deleteMany({
    where: { email: { in: [USER_A.email, USER_B.email] } },
  }).catch(() => {});
  await prisma.organisation.deleteMany({
    where: { name: { in: [ORG_A.name, ORG_B.name] } },
  }).catch(() => {});
}

beforeAll(async () => {
  const db = await import('@ice/db');
  prisma = db.default;
  canvasService = await import('../services/canvas.service');
  envService = await import('../services/environment.service');

  await cleanup();

  // Create two orgs
  const orgA = await prisma.organisation.create({ data: { name: ORG_A.name } });
  const orgB = await prisma.organisation.create({ data: { name: ORG_B.name } });
  ORG_A.id = orgA.id;
  ORG_B.id = orgB.id;

  // Create users
  const userA = await prisma.user.create({
    data: { email: USER_A.email, name: 'User A', password_hash: '@@test@@', organisation_id: ORG_A.id },
  });
  const userB = await prisma.user.create({
    data: { email: USER_B.email, name: 'User B', password_hash: '@@test@@', organisation_id: ORG_B.id },
  });
  USER_A.id = userA.id;
  USER_B.id = userB.id;

  // Org memberships
  await prisma.organisationMember.create({ data: { user_id: USER_A.id, organisation_id: ORG_A.id, role: 'owner' } });
  await prisma.organisationMember.create({ data: { user_id: USER_B.id, organisation_id: ORG_B.id, role: 'owner' } });

  // Create resources — one project + one folder in each org
  projectA = await canvasService.createProject(ORG_A.id, USER_A.id, 'Alpha Project', 'project');
  projectB = await canvasService.createProject(ORG_B.id, USER_B.id, 'Beta Project', 'project');
  folderA = await canvasService.createProject(ORG_A.id, USER_A.id, 'Alpha Folder', 'folder');
  folderB = await canvasService.createProject(ORG_B.id, USER_B.id, 'Beta Folder', 'folder');

  // Grant project access
  await prisma.projectMember.create({
    data: { project_id: projectA.id, user_id: USER_A.id, role: 'owner', granted_by: USER_A.id },
  });
  await prisma.projectMember.create({
    data: { project_id: projectB.id, user_id: USER_B.id, role: 'owner', granted_by: USER_B.id },
  });
}, 30000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// =============================================================================
// 1. listProjects — org isolation
// =============================================================================

describe('listProjects — org isolation', () => {
  it('Org A only sees its own projects and folders', async () => {
    const results = await canvasService.listProjects(ORG_A.id);
    const ids = results.map((p: any) => p.id);

    expect(ids).toContain(projectA.id);
    expect(ids).toContain(folderA.id);
    expect(ids).not.toContain(projectB.id);
    expect(ids).not.toContain(folderB.id);
  });

  it('Org B only sees its own projects and folders', async () => {
    const results = await canvasService.listProjects(ORG_B.id);
    const ids = results.map((p: any) => p.id);

    expect(ids).toContain(projectB.id);
    expect(ids).toContain(folderB.id);
    expect(ids).not.toContain(projectA.id);
    expect(ids).not.toContain(folderA.id);
  });

  it('non-existent org returns empty', async () => {
    const results = await canvasService.listProjects('non-existent-org-id');
    expect(results).toEqual([]);
  });
});

// =============================================================================
// 2. createProject — cross-org parent folder rejection
// =============================================================================

describe('createProject — cross-org parent folder rejection', () => {
  it('rejects creating project under folder from different org', async () => {
    await expect(
      canvasService.createProject(ORG_A.id, USER_A.id, 'Smuggled', 'project', folderB.id),
    ).rejects.toThrow('Parent folder not found');
  });

  it('rejects creating folder under folder from different org', async () => {
    await expect(
      canvasService.createProject(ORG_A.id, USER_A.id, 'Smuggled', 'folder', folderB.id),
    ).rejects.toThrow('Parent folder not found');
  });

  it('allows creating under own org folder', async () => {
    const child = await canvasService.createProject(ORG_A.id, USER_A.id, 'Child', 'project', folderA.id);
    expect(child.parent_id).toBe(folderA.id);
    expect(child.organisation_id).toBe(ORG_A.id);
    // cleanup
    await prisma.environment.deleteMany({ where: { project_id: child.id } });
    await prisma.canvasCard.deleteMany({ where: { project_id: child.id } });
    await prisma.canvasProject.delete({ where: { id: child.id } });
  });
});

// =============================================================================
// 3. getProject — no org filter (relies on middleware)
// =============================================================================

describe('getProject — no org filter in service', () => {
  it('returns project regardless of who asks (service has no org check)', async () => {
    // This documents that getProject() has NO org parameter — it returns any project by ID.
    // Org isolation relies entirely on requireProjectAccess middleware in the route.
    const result = await canvasService.getProject(projectA.id);
    expect(result.id).toBe(projectA.id);
    expect(result.organisation_id).toBe(ORG_A.id);
  });
});

// =============================================================================
// 4. moveProject — missing org validation on target parent (BUG)
// =============================================================================

describe('moveProject — cross-org parent validation', () => {
  it('rejects moving project to folder in different org when orgId is provided', async () => {
    await expect(
      canvasService.moveProject(projectA.id, folderB.id, ORG_A.id),
    ).rejects.toThrow('Target folder not found');

    // Verify project was NOT moved
    const check = await prisma.canvasProject.findUnique({ where: { id: projectA.id } });
    expect(check.parent_id).toBeNull();
    expect(check.organisation_id).toBe(ORG_A.id);
  });

  it('allows moving project to folder in same org', async () => {
    await canvasService.moveProject(projectA.id, folderA.id, ORG_A.id);
    const moved = await prisma.canvasProject.findUnique({ where: { id: projectA.id } });
    expect(moved.parent_id).toBe(folderA.id);
    // Restore
    await canvasService.moveProject(projectA.id, null, ORG_A.id);
  });
});

// =============================================================================
// 5. Cards — getCard has no org check (BUG)
// =============================================================================

describe('getCard — no org check in service', () => {
  it('BUG: any user can read any card by ID', async () => {
    const cardsA = await prisma.canvasCard.findMany({ where: { project_id: projectA.id } });
    if (cardsA.length === 0) return;

    // getCard has no org parameter — returns card to anyone
    const card = await canvasService.getCard(cardsA[0].id);
    expect(card).toBeDefined();
    expect(card.project_id).toBe(projectA.id);
    // The route /cards/get ALSO has no requireProjectAccess middleware
  });
});

// =============================================================================
// 6. Cards — updateCard has no org check in service
// =============================================================================

describe('updateCard — no org check in service', () => {
  it('BUG: any user can update any card by ID at service level', async () => {
    const cardsB = await prisma.canvasCard.findMany({ where: { project_id: projectB.id } });
    if (cardsB.length === 0) return;

    const original = cardsB[0].name;
    // Service lets anyone update any card
    await canvasService.updateCard(cardsB[0].id, { name: 'Hacked' });

    const updated = await prisma.canvasCard.findUnique({ where: { id: cardsB[0].id } });
    expect(updated.name).toBe('Hacked');

    // Restore
    await canvasService.updateCard(cardsB[0].id, { name: original });
  });
});

// =============================================================================
// 7. Environment routes — no requireProjectAccess (BUG)
// =============================================================================

describe('Environment service — org isolation', () => {
  it('BUG: listEnvironments has no org check — returns envs for any projectId', async () => {
    // envService.listEnvironments takes projectId but NO orgId
    const envs = await envService.listEnvironments(projectA.id);
    // Returns Org A's environments to anyone who knows the project ID
    expect(envs.length).toBeGreaterThan(0);
    expect(envs[0].project_id).toBe(projectA.id);
  });

  it('BUG: createEnvironment has no org check — creates env in any project', async () => {
    // User B could call this with Org A's project ID
    const env = await envService.createEnvironment(projectA.id, USER_B.id, 'hacked-env', 'staging');
    expect(env).toBeDefined();
    expect(env.project_id).toBe(projectA.id);

    // Cleanup — environment has cascade from card, delete env first
    await prisma.environment.deleteMany({ where: { id: env.id } });
    if (env.card_id) {
      await prisma.canvasCard.deleteMany({ where: { id: env.card_id } });
    }
  });
});

// =============================================================================
// 8. deleteProject — org-scoped recursive delete
// =============================================================================

describe('deleteProject — org-scoped recursive delete', () => {
  it('only deletes children within same org', async () => {
    // Create a temp project in Org A with a child
    const parent = await canvasService.createProject(ORG_A.id, USER_A.id, 'Temp Parent', 'folder');
    const child = await canvasService.createProject(ORG_A.id, USER_A.id, 'Temp Child', 'project', parent.id);

    await canvasService.deleteProject(parent.id, ORG_A.id);

    // Both should be deleted
    const parentCheck = await prisma.canvasProject.findUnique({ where: { id: parent.id } });
    const childCheck = await prisma.canvasProject.findUnique({ where: { id: child.id } });
    expect(parentCheck).toBeNull();
    expect(childCheck).toBeNull();
  });
});

// =============================================================================
// 9. requireProjectAccess middleware — cross-org rejection
// =============================================================================

describe('requireProjectAccess — cross-org rejection', () => {
  it('rejects user from different org', async () => {
    // Simulate middleware: User B tries to access Project A
    const { requireProjectAccess } = await import('@ice/shared');
    const middleware = requireProjectAccess('viewer');

    const result = await new Promise<{ status: number; body: any }>((resolve) => {
      const req: any = {
        userId: USER_B.id,
        organisationId: ORG_B.id,
        body: { projectId: projectA.id },
        params: {},
        query: {},
      };
      const res: any = {
        status(code: number) {
          return {
            json(body: any) {
              resolve({ status: code, body });
            },
          };
        },
      };
      middleware(req, res, () => {
        resolve({ status: 200, body: { ok: true } });
      });
    });

    // User B is NOT a member of Org A and NOT a member of Project A
    expect(result.status).toBe(403);
  });

  it('allows org owner to access their own project', async () => {
    const { requireProjectAccess } = await import('@ice/shared');
    const middleware = requireProjectAccess('viewer');

    const result = await new Promise<{ status: number; body: any }>((resolve) => {
      const req: any = {
        userId: USER_A.id,
        organisationId: ORG_A.id,
        body: { projectId: projectA.id },
        params: {},
        query: {},
      };
      const res: any = {
        status(code: number) {
          return {
            json(body: any) {
              resolve({ status: code, body });
            },
          };
        },
      };
      middleware(req, res, () => {
        resolve({ status: 200, body: { ok: true } });
      });
    });

    expect(result.status).toBe(200);
  });
});
