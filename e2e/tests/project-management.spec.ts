import { test, expect } from '../fixtures/base.fixture';

test.describe('Project Management', () => {
  test('should create new project', async ({ apiClient }) => {
    const project = await apiClient.post('/canvas/projects/create', {
      name: 'E2E Test Project',
      description: 'Created by E2E test',
    });
    expect(project.id).toBeTruthy();
    expect(project.name).toBe('E2E Test Project');
  });

  test('should list projects', async ({ apiClient }) => {
    // Create a project first
    await apiClient.post('/canvas/projects/create', { name: 'List Test Project' });

    const projects = await apiClient.post('/canvas/projects');
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
  });

  test('should rename project', async ({ apiClient }) => {
    const project = await apiClient.post('/canvas/projects/create', { name: 'Rename Me' });

    const result = await apiClient.post('/canvas/projects/update', {
      projectId: project.id,
      name: 'Renamed Project',
    });
    expect(result.success).toBe(true);
  });

  test('should delete project', async ({ apiClient }) => {
    const project = await apiClient.post('/canvas/projects/create', { name: 'Delete Me' });

    const result = await apiClient.post('/canvas/projects/delete', {
      projectId: project.id,
    });
    expect(result.success).toBe(true);
  });
});
