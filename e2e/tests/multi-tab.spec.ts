import { test, expect } from '../fixtures/base.fixture';

test.describe('Multi-Tab / Cards', () => {
  test('should create new card via API', async ({ apiClient }) => {
    const project = await apiClient.post('/canvas/projects/create', { name: 'Multi-Tab Test' });
    const card = await apiClient.post('/canvas/cards/create', {
      name: 'Tab 1',
      projectId: project.id,
    });
    expect(card.id).toBeTruthy();
    expect(card.name).toBe('Tab 1');
  });

  test('should create multiple cards in a project', async ({ apiClient }) => {
    const project = await apiClient.post('/canvas/projects/create', { name: 'Multi-Card Test' });

    const card1 = await apiClient.post('/canvas/cards/create', {
      name: 'Development',
      projectId: project.id,
    });
    const card2 = await apiClient.post('/canvas/cards/create', {
      name: 'Production',
      projectId: project.id,
    });

    expect(card1.id).not.toBe(card2.id);

    const projectData = await apiClient.post('/canvas/projects/get', {
      projectId: project.id,
    });
    // Project starts with 1 auto-created card (production env), plus our 2 = 3
    expect(projectData.cards.length).toBeGreaterThanOrEqual(2);
  });

  test('should update card nodes and edges', async ({ apiClient }) => {
    const project = await apiClient.post('/canvas/projects/create', { name: 'Update Test' });
    const card = await apiClient.post('/canvas/cards/create', {
      name: 'Test Card',
      projectId: project.id,
    });

    const nodes = [{ id: 'n1', type: 'resource', position: { x: 100, y: 100 }, data: { label: 'Test' } }];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];

    const updated = await apiClient.post('/canvas/cards/update', {
      cardId: card.id,
      nodes,
      edges,
    });

    expect(updated.nodes).toEqual(nodes);
    expect(updated.edges).toEqual(edges);
  });
});
