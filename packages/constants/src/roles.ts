/**
 * Role Constants
 *
 * Role identifiers + i18n key mappings. Display chrome (icons, color
 * classes) lives at the component level — those are React-bound and
 * out of scope for this package. Importing components only need the
 * value list and `labelKey` / `descKey` here, then attach their own
 * icons/colors.
 */

export type ProjectRole = 'viewer' | 'editor' | 'owner';

export interface ProjectRoleDef {
  value: ProjectRole;
  labelKey: string;
  descKey: string;
}

export const PROJECT_ROLES: readonly ProjectRoleDef[] = [
  { value: 'owner', labelKey: 'common.roles.owner', descKey: 'account.collaborators.roleOwnerDesc' },
  { value: 'editor', labelKey: 'common.roles.editor', descKey: 'account.collaborators.roleEditorDesc' },
  { value: 'viewer', labelKey: 'common.roles.viewer', descKey: 'account.collaborators.roleViewerDesc' },
] as const;

/**
 * Hierarchical level used to compare two roles (higher = more permissive).
 * Keyed by `string` (not `ProjectRole`) because callers often hold a raw
 * DB value typed as `string` and shouldn't have to cast at every site.
 * Unknown role names return undefined and the caller can fall back to 0.
 */
export const PROJECT_ROLE_LEVEL: Record<string, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export type OrgRole = 'viewer' | 'member' | 'admin' | 'owner';

export interface OrgRoleDef {
  value: OrgRole;
  labelKey: string;
}

export const ORG_ROLES: readonly OrgRoleDef[] = [
  { value: 'owner', labelKey: 'common.roles.owner' },
  { value: 'admin', labelKey: 'common.roles.admin' },
  { value: 'member', labelKey: 'common.roles.member' },
  { value: 'viewer', labelKey: 'common.roles.viewer' },
] as const;

/** Roles that can be issued via the invite-user modal. */
export const INVITABLE_ORG_ROLES: readonly OrgRole[] = ['admin', 'member', 'viewer'] as const;
