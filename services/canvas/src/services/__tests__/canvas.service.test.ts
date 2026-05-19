/**
 * Unit tests for `services/canvas/src/services/canvas.service.ts`.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest globals are
 * imported explicitly. Per `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * mocks are cleared in `beforeEach`.
 *
 * `@ice/db` (prisma) is mocked at the model level so we can drive each
 * branch of project/folder/card CRUD plus the recursive subtree-collection
 * logic in `deleteProject`. The transaction callback is invoked synchronously
 * with a stub `tx` that mirrors the same model surface so the inner deletes
 * are observable.
 *
 * `bootstrapProductionEnvironment` is mocked from the sibling environment
 * service so we can assert the auto-create branch in `createProject` without
 * pulling that whole module's behavior under test here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    canvasProject: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    canvasCard: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    deployEvent: {
      deleteMany: vi.fn(),
    },
    deploymentRule: {
      deleteMany: vi.fn(),
    },
    aiConversation: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../environment.service', () => ({
  bootstrapProductionEnvironment: vi.fn(),
}));

import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  moveProject,
  createCard,
  getCard,
  updateCard,
  deleteCard,
} from '../canvas.service';
// @ts-ignore — workspace-resolved at runtime
import prisma from '@ice/db';
import { bootstrapProductionEnvironment } from '../environment.service';

const projectFindMany = (prisma as any).canvasProject.findMany as ReturnType<typeof vi.fn>;
const projectFindFirst = (prisma as any).canvasProject.findFirst as ReturnType<typeof vi.fn>;
const projectCreate = (prisma as any).canvasProject.create as ReturnType<typeof vi.fn>;
const projectUpdateMany = (prisma as any).canvasProject.updateMany as ReturnType<typeof vi.fn>;
const projectUpdate = (prisma as any).canvasProject.update as ReturnType<typeof vi.fn>;
const projectDelete = (prisma as any).canvasProject.delete as ReturnType<typeof vi.fn>;
const cardFindMany = (prisma as any).canvasCard.findMany as ReturnType<typeof vi.fn>;
const cardFindUnique = (prisma as any).canvasCard.findUnique as ReturnType<typeof vi.fn>;
const cardCreate = (prisma as any).canvasCard.create as ReturnType<typeof vi.fn>;
const cardUpdate = (prisma as any).canvasCard.update as ReturnType<typeof vi.fn>;
const cardDelete = (prisma as any).canvasCard.delete as ReturnType<typeof vi.fn>;
const cardDeleteMany = (prisma as any).canvasCard.deleteMany as ReturnType<typeof vi.fn>;
const deployEventDeleteMany = (prisma as any).deployEvent.deleteMany as ReturnType<typeof vi.fn>;
const deploymentRuleDeleteMany = (prisma as any).deploymentRule.deleteMany as ReturnType<typeof vi.fn>;
const aiConversationDeleteMany = (prisma as any).aiConversation.deleteMany as ReturnType<typeof vi.fn>;
const transactionMock = (prisma as any).$transaction as ReturnType<typeof vi.fn>;
const bootstrapProductionMock = bootstrapProductionEnvironment as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── listProjects ────────────────────────────────────────────────────────────

describe('listProjects', () => {
  it('passes only org filter when parentId and search are unspecified', async () => {
    projectFindMany.mockResolvedValue([]);

    await listProjects('org-1');

    expect(projectFindMany).toHaveBeenCalledTimes(1);
    const args = projectFindMany.mock.calls[0]![0];
    expect(args.where).toEqual({ organisation_id: 'org-1' });
  });

  it('translates parentId="" to parent_id: null (root listing)', async () => {
    projectFindMany.mockResolvedValue([]);

    await listProjects('org-1', '');

    const args = projectFindMany.mock.calls[0]![0];
    expect(args.where.parent_id).toBeNull();
  });

  it('forwards a non-empty parentId verbatim as parent_id', async () => {
    projectFindMany.mockResolvedValue([]);

    await listProjects('org-1', 'parent-1');

    expect(projectFindMany.mock.calls[0]![0].where.parent_id).toBe('parent-1');
  });

  it('skips parent_id filter when parentId is undefined (any depth)', async () => {
    projectFindMany.mockResolvedValue([]);

    await listProjects('org-1', undefined, 'q');

    const where = projectFindMany.mock.calls[0]![0].where;
    expect(where.parent_id).toBeUndefined();
  });

  it('appends a case-insensitive contains-search filter when search is provided', async () => {
    projectFindMany.mockResolvedValue([]);

    await listProjects('org-1', undefined, 'foo');

    expect(projectFindMany.mock.calls[0]![0].where.name).toEqual({
      contains: 'foo',
      mode: 'insensitive',
    });
  });
});

// ── createProject ───────────────────────────────────────────────────────────

describe('createProject', () => {
  it('creates a folder when type="folder" without bootstrapping a production env', async () => {
    projectCreate.mockResolvedValue({ id: 'p1', type: 'folder', name: 'F' });

    const result = await createProject('org-1', 'u-1', 'F', 'folder');

    expect(result).toEqual({ id: 'p1', type: 'folder', name: 'F' });
    expect(projectCreate).toHaveBeenCalledTimes(1);
    expect(projectCreate.mock.calls[0]![0].data.type).toBe('folder');
    expect(bootstrapProductionMock).not.toHaveBeenCalled();
  });

  it('coerces any non-folder type literal to "project"', async () => {
    projectCreate.mockResolvedValue({ id: 'p1', name: 'X', type: 'project' });
    bootstrapProductionMock.mockResolvedValue(undefined);

    await createProject('org-1', 'u-1', 'X', 'something-else');

    expect(projectCreate.mock.calls[0]![0].data.type).toBe('project');
  });

  it('bootstraps a production environment when creating a project (not a folder)', async () => {
    projectCreate.mockResolvedValue({ id: 'p2', name: 'My Project', type: 'project' });
    bootstrapProductionMock.mockResolvedValue(undefined);

    await createProject('org-1', 'u-1', 'My Project', 'project');

    expect(bootstrapProductionMock).toHaveBeenCalledWith('p2', 'u-1', 'My Project');
  });

  it('throws "Parent folder not found" when parentId references a missing/non-folder row', async () => {
    projectFindFirst.mockResolvedValue(null);

    await expect(createProject('org-1', 'u-1', 'X', 'project', 'missing'))
      .rejects.toThrow('Parent folder not found');
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it('passes parentId verbatim to findFirst when validating a parent folder', async () => {
    projectFindFirst.mockResolvedValue({ id: 'parent-1', type: 'folder' });
    projectCreate.mockResolvedValue({ id: 'child', type: 'folder' });

    await createProject('org-1', 'u-1', 'X', 'folder', 'parent-1');

    expect(projectFindFirst).toHaveBeenCalledWith({
      where: { id: 'parent-1', organisation_id: 'org-1', type: 'folder' },
    });
  });

  it('builds a slug from the name (lowercase, non-alphanumeric→dashes, suffix from Date.now base36)', async () => {
    projectCreate.mockResolvedValue({ id: 'p3', type: 'folder', name: 'Foo  Bar!' });

    await createProject('org-1', 'u-1', 'Foo  Bar!', 'folder');

    const slug = projectCreate.mock.calls[0]![0].data.slug as string;
    expect(slug.startsWith('foo-bar-')).toBe(true);
    expect(slug).toMatch(/^foo-bar-[0-9a-z]+$/);
  });

  it('falls back to a default name when the name argument is empty', async () => {
    projectCreate.mockResolvedValue({ id: 'p4', type: 'project', name: 'Untitled Project' });
    bootstrapProductionMock.mockResolvedValue(undefined);

    await createProject('org-1', 'u-1', '', 'project');

    expect(projectCreate.mock.calls[0]![0].data.name).toBe('Untitled Project');
  });

  it('uses the folder default name when type is folder and name is empty', async () => {
    projectCreate.mockResolvedValue({ id: 'p4', type: 'folder', name: 'New Folder' });

    await createProject('org-1', 'u-1', '', 'folder');

    expect(projectCreate.mock.calls[0]![0].data.name).toBe('New Folder');
  });

  it('falls back the slug source to "untitled" when the name is empty', async () => {
    projectCreate.mockResolvedValue({ id: 'p5', type: 'folder' });

    await createProject('org-1', 'u-1', '', 'folder');

    const slug = projectCreate.mock.calls[0]![0].data.slug as string;
    expect(slug.startsWith('untitled-')).toBe(true);
  });

  it('writes parent_id=null when parentId is omitted', async () => {
    projectCreate.mockResolvedValue({ id: 'p6', type: 'folder' });

    await createProject('org-1', 'u-1', 'F', 'folder');

    expect(projectCreate.mock.calls[0]![0].data.parent_id).toBeNull();
  });
});

// ── getProject ──────────────────────────────────────────────────────────────

describe('getProject', () => {
  it('returns the project when found', async () => {
    const project = { id: 'p1', name: 'P', cards: [], environments: [] };
    projectFindFirst.mockResolvedValue(project);

    const result = await getProject('p1');

    expect(result).toBe(project);
  });

  it('throws "Project not found" when findFirst returns null', async () => {
    projectFindFirst.mockResolvedValue(null);

    await expect(getProject('missing')).rejects.toThrow('Project not found');
  });
});

// ── updateProject ───────────────────────────────────────────────────────────

describe('updateProject', () => {
  it('returns success=true when updateMany affects at least one row', async () => {
    projectUpdateMany.mockResolvedValue({ count: 1 });

    const result = await updateProject('p1', { name: 'New' });

    expect(result).toEqual({ success: true });
    expect(projectUpdateMany.mock.calls[0]![0].data).toEqual({ name: 'New' });
  });

  it('returns success=false when no rows match', async () => {
    projectUpdateMany.mockResolvedValue({ count: 0 });

    const result = await updateProject('p1', { name: 'New' });

    expect(result).toEqual({ success: false });
  });

  it('only includes fields that are explicitly defined (undefined fields stripped)', async () => {
    projectUpdateMany.mockResolvedValue({ count: 1 });

    await updateProject('p1', { name: 'N', description: undefined, region: 'us-east' });

    expect(projectUpdateMany.mock.calls[0]![0].data).toEqual({
      name: 'N',
      region: 'us-east',
    });
  });

  it('writes an empty data payload when no fields are provided', async () => {
    projectUpdateMany.mockResolvedValue({ count: 1 });

    await updateProject('p1', {});

    expect(projectUpdateMany.mock.calls[0]![0].data).toEqual({});
  });

  it('forwards all four supported fields (name/description/provider/region) when provided', async () => {
    projectUpdateMany.mockResolvedValue({ count: 1 });

    await updateProject('p1', { name: 'N', description: 'D', provider: 'gcp', region: 'us-east' });

    expect(projectUpdateMany.mock.calls[0]![0].data).toEqual({
      name: 'N',
      description: 'D',
      provider: 'gcp',
      region: 'us-east',
    });
  });
});

// ── deleteProject (recursive subtree, transactional) ───────────────────────

describe('deleteProject', () => {
  /**
   * Helper: a stub `tx` mirroring the prisma surface the SUT touches inside
   * the transaction. Each method records its calls so we can assert order and
   * `where` payloads. The same fakeTx is what `$transaction(cb)` will pass.
   */
  function makeTxMocks() {
    return {
      deployEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      deploymentRule: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      aiConversation: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      canvasProject: {
        findMany: vi.fn(),
        delete: vi.fn().mockResolvedValue({ id: 'x' }),
      },
      canvasCard: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
  }

  it('deletes a leaf project (no children, no cards) without touching orphan tables', async () => {
    // collectCardIds: walk → no children, no cards
    projectFindMany.mockResolvedValue([]);
    cardFindMany.mockResolvedValue([]);

    const tx = makeTxMocks();
    tx.canvasProject.findMany.mockResolvedValue([]);
    transactionMock.mockImplementation(async (cb: any) => cb(tx));

    await deleteProject('p1', 'org-1');

    // No card ids → no DeployEvent / DeploymentRule wipes
    expect(tx.deployEvent.deleteMany).not.toHaveBeenCalled();
    expect(tx.deploymentRule.deleteMany).not.toHaveBeenCalled();
    // aiConversation is always swept by project_id list
    expect(tx.aiConversation.deleteMany).toHaveBeenCalledWith({
      where: { project_id: { in: ['p1'] } },
    });
    expect(tx.canvasCard.deleteMany).toHaveBeenCalledWith({ where: { project_id: 'p1' } });
    expect(tx.canvasProject.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  it('wipes deploy events and deployment rules for the cards in the subtree before deletion', async () => {
    // Outer pre-collection: walk parent → no children, then cards
    projectFindMany.mockImplementation(async ({ where }: any) => {
      // no children
      if (where.parent_id) return [];
      return [];
    });
    cardFindMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

    const tx = makeTxMocks();
    tx.canvasProject.findMany.mockResolvedValue([]);
    transactionMock.mockImplementation(async (cb: any) => cb(tx));

    await deleteProject('p1', 'org-1');

    expect(tx.deployEvent.deleteMany).toHaveBeenCalledWith({
      where: { card_id: { in: ['c1', 'c2'] } },
    });
    expect(tx.deploymentRule.deleteMany).toHaveBeenCalledWith({
      where: { card_id: { in: ['c1', 'c2'] } },
    });
  });

  it('recurses through nested folder children, deleting deepest first', async () => {
    // Tree: p1 → p2 → p3 (each a folder with no cards)
    // outer collectCardIds walks p1 → children=[p2] → recurse p2 → children=[p3] → recurse p3 → no children, no cards
    // outer collectProjectIds walks the same tree.
    projectFindMany.mockImplementation(async ({ where }: any) => {
      if (where.parent_id === 'p1') return [{ id: 'p2' }];
      if (where.parent_id === 'p2') return [{ id: 'p3' }];
      return [];
    });
    cardFindMany.mockResolvedValue([]);

    const tx = makeTxMocks();
    // Inner deleteSubtree mirrors the outer walk
    tx.canvasProject.findMany.mockImplementation(async ({ where }: any) => {
      if (where.parent_id === 'p1') return [{ id: 'p2' }];
      if (where.parent_id === 'p2') return [{ id: 'p3' }];
      return [];
    });
    transactionMock.mockImplementation(async (cb: any) => cb(tx));

    await deleteProject('p1', 'org-1');

    // Order: p3 first, then p2, then p1
    const deleteCalls = tx.canvasProject.delete.mock.calls.map((c: any) => c[0].where.id);
    expect(deleteCalls).toEqual(['p3', 'p2', 'p1']);
    // aiConversation swept with the full project list
    const aiCall = tx.aiConversation.deleteMany.mock.calls[0]![0].where.project_id.in;
    expect(aiCall).toContain('p1');
    expect(aiCall).toContain('p2');
    expect(aiCall).toContain('p3');
  });
});

// ── moveProject ─────────────────────────────────────────────────────────────

describe('moveProject', () => {
  it('moves to root when parentId is null (no parent validation, no descendant check)', async () => {
    projectUpdate.mockResolvedValue({});

    await moveProject('p1', null);

    expect(projectFindFirst).not.toHaveBeenCalled();
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { parent_id: null },
    });
  });

  it('skips org-scope validation when orgId is omitted', async () => {
    projectFindMany.mockResolvedValue([]); // no descendants
    projectUpdate.mockResolvedValue({});

    await moveProject('p1', 'parent-1');

    // findFirst is the org-scope check — should NOT be called
    expect(projectFindFirst).not.toHaveBeenCalled();
    expect(projectUpdate).toHaveBeenCalled();
  });

  it('throws when target parent is missing or in a different org', async () => {
    projectFindFirst.mockResolvedValue(null);

    await expect(moveProject('p1', 'parent-x', 'org-1')).rejects.toThrow(
      'Target folder not found or belongs to a different organisation',
    );
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it('throws "Cannot move folder into its own descendant" on a direct child cycle', async () => {
    projectFindFirst.mockResolvedValue({ id: 'desc', type: 'folder' });
    // Walk: p1 → [p2] → p2 === target ('p2')
    projectFindMany.mockImplementation(async ({ where }: any) => {
      if (where.parent_id === 'p1') return [{ id: 'p2' }];
      return [];
    });

    await expect(moveProject('p1', 'p2', 'org-1')).rejects.toThrow(
      'Cannot move folder into its own descendant',
    );
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it('detects a descendant deeper than one level (recursive isDescendant)', async () => {
    projectFindFirst.mockResolvedValue({ id: 'p3', type: 'folder' });
    // p1 → [p2] → [p3] (target). The recursive call must walk into p2 to hit p3.
    projectFindMany.mockImplementation(async ({ where }: any) => {
      if (where.parent_id === 'p1') return [{ id: 'p2' }];
      if (where.parent_id === 'p2') return [{ id: 'p3' }];
      return [];
    });

    await expect(moveProject('p1', 'p3', 'org-1')).rejects.toThrow(
      'Cannot move folder into its own descendant',
    );
  });

  it('continues iterating siblings when an earlier child sub-walk returns false', async () => {
    projectFindFirst.mockResolvedValue({ id: 'target', type: 'folder' });
    // p1 has two children: pA (no descendants → returns false), pB → [target] (returns true).
    // Both branches of the for-loop continuation must execute: false-return on pA, true-return on pB.
    projectFindMany.mockImplementation(async ({ where }: any) => {
      if (where.parent_id === 'p1') return [{ id: 'pA' }, { id: 'pB' }];
      if (where.parent_id === 'pA') return [];
      if (where.parent_id === 'pB') return [{ id: 'target' }];
      return [];
    });

    await expect(moveProject('p1', 'target', 'org-1')).rejects.toThrow(
      'Cannot move folder into its own descendant',
    );
  });

  it('successfully moves to a non-descendant folder', async () => {
    projectFindFirst.mockResolvedValue({ id: 'sibling', type: 'folder' });
    projectFindMany.mockResolvedValue([]); // no descendants
    projectUpdate.mockResolvedValue({});

    await moveProject('p1', 'sibling', 'org-1');

    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { parent_id: 'sibling' },
    });
  });

  it('translates parentId="" to null', async () => {
    projectUpdate.mockResolvedValue({});

    await moveProject('p1', '');

    expect(projectUpdate.mock.calls[0]![0].data.parent_id).toBeNull();
  });
});

// ── createCard ──────────────────────────────────────────────────────────────

describe('createCard', () => {
  it('creates a card under an existing project', async () => {
    cardCreate.mockResolvedValue({ id: 'card-1', name: 'My Card' });

    const result = await createCard('proj-1', 'org-1', 'user-1', 'My Card');

    expect(projectCreate).not.toHaveBeenCalled();
    expect(cardCreate).toHaveBeenCalledWith({
      data: { name: 'My Card', project_id: 'proj-1', nodes: [], edges: [] },
    });
    expect(result).toEqual({ id: 'card-1', name: 'My Card' });
  });

  it('auto-creates a default project when projectId is omitted', async () => {
    projectCreate.mockResolvedValue({ id: 'auto-proj' });
    cardCreate.mockResolvedValue({ id: 'card-1' });

    await createCard(undefined, 'org-1', 'user-1', 'Card A');

    expect(projectCreate).toHaveBeenCalledTimes(1);
    const projData = projectCreate.mock.calls[0]![0].data;
    expect(projData.name).toBe('Card A');
    expect(projData.organisation_id).toBe('org-1');
    expect(projData.created_by).toBe('user-1');
    expect(projData.type).toBe('project');
    expect(projData.slug.startsWith('untitled-')).toBe(true);
    expect(cardCreate.mock.calls[0]![0].data.project_id).toBe('auto-proj');
  });

  it('uses "Untitled" as the auto-project name and "Untitled Card" for the card when no name is given', async () => {
    projectCreate.mockResolvedValue({ id: 'auto-proj' });
    cardCreate.mockResolvedValue({ id: 'card-1' });

    await createCard(undefined, 'org-1', 'user-1');

    expect(projectCreate.mock.calls[0]![0].data.name).toBe('Untitled');
    expect(cardCreate.mock.calls[0]![0].data.name).toBe('Untitled Card');
  });
});

// ── getCard ─────────────────────────────────────────────────────────────────

describe('getCard', () => {
  it('returns the card when found', async () => {
    const card = { id: 'card-1', name: 'C', nodes: [], edges: [] };
    cardFindUnique.mockResolvedValue(card);

    const result = await getCard('card-1');

    expect(result).toBe(card);
    expect(cardFindUnique).toHaveBeenCalledWith({ where: { id: 'card-1' } });
  });

  it('throws "Card not found" when findUnique returns null', async () => {
    cardFindUnique.mockResolvedValue(null);

    await expect(getCard('missing')).rejects.toThrow('Card not found');
  });
});

// ── updateCard ──────────────────────────────────────────────────────────────

describe('updateCard', () => {
  it('updates only provided fields (defined-stripping)', async () => {
    cardUpdate.mockResolvedValue({ id: 'card-1', name: 'New' });

    await updateCard('card-1', { name: 'New' });

    expect(cardUpdate).toHaveBeenCalledWith({
      where: { id: 'card-1' },
      data: { name: 'New' },
    });
  });

  it('writes nodes/edges/viewport when provided', async () => {
    cardUpdate.mockResolvedValue({ id: 'card-1' });

    await updateCard('card-1', {
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'e1' }],
      viewport: { x: 1, y: 2, zoom: 1 },
    });

    expect(cardUpdate.mock.calls[0]![0].data).toEqual({
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'e1' }],
      viewport: { x: 1, y: 2, zoom: 1 },
    });
  });

  it('writes nothing when all fields are undefined', async () => {
    cardUpdate.mockResolvedValue({ id: 'card-1' });

    await updateCard('card-1', {});

    expect(cardUpdate.mock.calls[0]![0].data).toEqual({});
  });
});

// ── deleteCard ──────────────────────────────────────────────────────────────

describe('deleteCard', () => {
  it('calls prisma.canvasCard.delete with the cardId', async () => {
    cardDelete.mockResolvedValue({});

    await deleteCard('card-1');

    expect(cardDelete).toHaveBeenCalledWith({ where: { id: 'card-1' } });
  });
});
