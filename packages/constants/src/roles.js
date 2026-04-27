/**
 * Role Constants
 *
 * Role identifiers + i18n key mappings. Display chrome (icons, color
 * classes) lives at the component level — those are React-bound and
 * out of scope for this package. Importing components only need the
 * value list and `labelKey` / `descKey` here, then attach their own
 * icons/colors.
 */
export const PROJECT_ROLES = [
    { value: 'owner', labelKey: 'common.roles.owner', descKey: 'account.collaborators.roleOwnerDesc' },
    { value: 'editor', labelKey: 'common.roles.editor', descKey: 'account.collaborators.roleEditorDesc' },
    { value: 'viewer', labelKey: 'common.roles.viewer', descKey: 'account.collaborators.roleViewerDesc' },
];
/**
 * Hierarchical level used to compare two roles (higher = more permissive).
 * Keyed by `string` (not `ProjectRole`) because callers often hold a raw
 * DB value typed as `string` and shouldn't have to cast at every site.
 * Unknown role names return undefined and the caller can fall back to 0.
 */
export const PROJECT_ROLE_LEVEL = {
    viewer: 1,
    editor: 2,
    owner: 3,
};
export const ORG_ROLES = [
    { value: 'owner', labelKey: 'common.roles.owner' },
    { value: 'admin', labelKey: 'common.roles.admin' },
    { value: 'member', labelKey: 'common.roles.member' },
    { value: 'viewer', labelKey: 'common.roles.viewer' },
];
/** Roles that can be issued via the invite-user modal. */
export const INVITABLE_ORG_ROLES = ['admin', 'member', 'viewer'];
