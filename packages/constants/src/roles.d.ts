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
export declare const PROJECT_ROLES: readonly ProjectRoleDef[];
/**
 * Hierarchical level used to compare two roles (higher = more permissive).
 * Keyed by `string` (not `ProjectRole`) because callers often hold a raw
 * DB value typed as `string` and shouldn't have to cast at every site.
 * Unknown role names return undefined and the caller can fall back to 0.
 */
export declare const PROJECT_ROLE_LEVEL: Record<string, number>;
export type OrgRole = 'viewer' | 'member' | 'admin' | 'owner';
export interface OrgRoleDef {
    value: OrgRole;
    labelKey: string;
}
export declare const ORG_ROLES: readonly OrgRoleDef[];
/** Roles that can be issued via the invite-user modal. */
export declare const INVITABLE_ORG_ROLES: readonly OrgRole[];
