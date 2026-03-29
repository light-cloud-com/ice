/**
 * Project Collaborators — Manage who has access to a project
 *
 * Shows member list with roles, add/remove/change role actions.
 * Renders inside project settings page.
 */

import { UserPlus, Shield, Pencil, Eye, Trash2, Loader2 } from 'lucide-react';
import React, { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '../../../i18n';
import axiosInstance from '../../../shared/api/axios-instance';
import { cn } from '../../../shared/utils/cn';
import type { RootState } from '../../../store';

interface ProjectMember {
  userId: string;
  email: string;
  name: string;
  avatar: string | null;
  role: string;
  grantedAt: string;
}

interface OrgMember {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: string;
}

const ROLE_DEFS = [
  { value: 'owner', labelKey: 'common.roles.owner', icon: Shield, descKey: 'account.collaborators.roleOwnerDesc' },
  { value: 'editor', labelKey: 'common.roles.editor', icon: Pencil, descKey: 'account.collaborators.roleEditorDesc' },
  { value: 'viewer', labelKey: 'common.roles.viewer', icon: Eye, descKey: 'account.collaborators.roleViewerDesc' },
];

interface ProjectCollaboratorsProps {
  projectId: string;
}

export const ProjectCollaborators: React.FC<ProjectCollaboratorsProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const currentUser = useSelector((s: RootState) => s.account.user);
  const selectedOrg = useSelector((s: RootState) => s.account.selectedOrg);

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('editor');
  const [adding, setAdding] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await axiosInstance.post('/project-members/list', { projectId });
      setMembers(res.data);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [projectId]);

  const fetchOrgMembers = useCallback(async () => {
    if (!selectedOrg) return;
    try {
      const res = await axiosInstance.post('/users', { targetOrganisationId: selectedOrg.id, limit: 100 });
      setOrgMembers(res.data.items);
    } catch {
      /* ignore */
    }
  }, [selectedOrg]);

  useEffect(() => {
    fetchMembers();
    fetchOrgMembers();
  }, [fetchMembers, fetchOrgMembers]);

  const handleAdd = async () => {
    if (!addUserId) return;
    setAdding(true);
    try {
      await axiosInstance.post('/project-members/add', { projectId, userId: addUserId, role: addRole });
      setAddUserId('');
      setShowAdd(false);
      fetchMembers();
    } catch {
      /* ignore */
    }
    setAdding(false);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await axiosInstance.post('/project-members/update-role', { projectId, userId, role: newRole });
      fetchMembers();
    } catch {
      /* ignore */
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await axiosInstance.post('/project-members/remove', { projectId, userId });
      fetchMembers();
    } catch {
      /* ignore */
    }
  };

  // Members not already in the project
  const availableToAdd = orgMembers.filter((om) => !members.some((m) => m.userId === om.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-ice-text-3" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + add button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ice-sm font-medium text-ice-text-1">{t('account.collaborators.title')}</h3>
          <p className="text-ice-xs text-ice-text-3">
            {members.length} {t('account.collaborators.memberCount')}{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {availableToAdd.length > 0 && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 text-ice-xs font-medium text-ice-accent hover:text-ice-accent-hover transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {t('account.collaborators.addMember')}
          </button>
        )}
      </div>

      {/* Add member form */}
      {showAdd && (
        <div className="p-3 rounded-lg bg-ice-raised border border-ice-border space-y-3">
          <div>
            <label className="block text-ice-xs font-medium text-ice-text-2 mb-1">{t('account.collaborators.teamMemberLabel')}</label>
            <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="ice-input w-full">
              <option value="">{t('account.collaborators.selectMember')}</option>
              {availableToAdd.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-ice-xs font-medium text-ice-text-2 mb-1">{t('account.collaborators.roleLabel')}</label>
            <div className="space-y-1.5">
              {ROLE_DEFS.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setAddRole(r.value)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 rounded-md border text-left transition-all text-ice-xs',
                      addRole === r.value
                        ? 'border-ice-accent bg-ice-accent/5'
                        : 'border-ice-border hover:border-ice-text-3',
                    )}
                  >
                    <Icon className={cn('w-3 h-3', addRole === r.value ? 'text-ice-accent' : 'text-ice-text-3')} />
                    <span className="font-medium text-ice-text-1">{t(r.labelKey)}</span>
                    <span className="text-ice-text-3 ml-1">{t(r.descKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="text-ice-xs text-ice-text-3 hover:text-ice-text-1 px-3 py-1.5"
            >
              {t('account.collaborators.cancelButton')}
            </button>
            <button
              onClick={handleAdd}
              disabled={!addUserId || adding}
              className="ice-btn ice-btn-primary text-ice-xs px-3 py-1.5"
            >
              {adding && <Loader2 className="w-3 h-3 animate-spin" />}
              {t('account.collaborators.addButton')}
            </button>
          </div>
        </div>
      )}

      {/* Member list */}
      <div className="space-y-1">
        {members.map((m) => {
          const isCurrentUser = m.userId === currentUser?.id;
          return (
            <div
              key={m.userId}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ice-hover transition-colors"
            >
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-ice-raised border border-ice-border flex items-center justify-center text-ice-xs font-medium text-ice-text-2 shrink-0">
                {m.avatar ? (
                  <img src={m.avatar} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  m.name.charAt(0).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-ice-xs font-medium text-ice-text-1 truncate">
                  {m.name}
                  {isCurrentUser && <span className="text-ice-text-3 ml-1">{t('account.collaborators.youBadge')}</span>}
                </p>
                <p className="text-[10px] text-ice-text-3 truncate">{m.email}</p>
              </div>

              {/* Role dropdown */}
              {!isCurrentUser ? (
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                  className="text-ice-xs bg-ice-raised border border-ice-border rounded px-2 py-1 text-ice-text-1"
                >
                  {ROLE_DEFS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {t(r.labelKey)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-ice-xs text-ice-text-3 capitalize">{m.role}</span>
              )}

              {/* Remove */}
              {!isCurrentUser && (
                <button
                  onClick={() => handleRemove(m.userId)}
                  className="p-1 rounded text-ice-text-3 hover:text-ice-red hover:bg-ice-hover transition-colors"
                  title={t('account.collaborators.removeTitle')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
