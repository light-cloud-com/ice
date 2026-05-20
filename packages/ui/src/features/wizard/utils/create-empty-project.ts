/**
 * Direct empty-project creation.
 *
 * Replaces the multi-step project wizard for the common "give me a
 * blank canvas right now" case. POSTs to `/canvas/projects/create`
 * with a default name and navigates straight to the new project's URL.
 *
 * Callers that need template selection, environment config, or a
 * named project should still open the wizard via `openDialog('projectWizard')`.
 */
import axiosInstance from '../../../shared/api/axios-instance';
import { toSlug } from '../../../shared/utils/slug';

interface CreateEmptyProjectOptions {
  organisationId: string;
  organisationName: string;
  defaultName: string;
  parentId?: string | null;
  navigate: (path: string) => void;
  /** Optional refresh hook (re-fetch projects list, expand parent folder, etc.). */
  onCreated?: (projectId: string) => void;
}

interface CreatedProject {
  id: string;
  slug?: string | null;
  name: string;
}

export async function createEmptyProjectAndNavigate(opts: CreateEmptyProjectOptions): Promise<CreatedProject | null> {
  const { organisationId, organisationName, defaultName, parentId, navigate, onCreated } = opts;
  if (!organisationId) return null;

  try {
    const res = await axiosInstance.post('/canvas/projects/create', {
      name: defaultName,
      type: 'project',
      parentId: parentId ?? null,
      organisationId,
    });
    const project = res.data as CreatedProject;
    onCreated?.(project.id);

    const orgSlug = toSlug(organisationName);
    const projectSlug = project.slug || toSlug(project.name || defaultName);
    navigate(`/${orgSlug}/${projectSlug}`);
    return project;
  } catch (err) {
    console.error('[create-empty-project] failed:', err);
    return null;
  }
}
