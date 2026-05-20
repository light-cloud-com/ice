/**
 * TeamPage
 *
 * Team management: list members with real roles (owner/admin/member/viewer),
 * change roles, remove members, invite users, show pending invitations.
 */

import { UserPlus, Loader2, Shield, User, Eye, Trash2, Clock, Mail } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { InviteUserModal } from './invite-user-modal';
import { useTranslation } from '../../../i18n';
import axiosInstance from '../../../shared/api/axios-instance';
import { cn } from '../../../shared/utils/cn';
import type { RootState } from '../../../store';

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  lastLogin: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
}

const ORG_ROLES = [
  { value: 'owner', labelKey: 'common.roles.owner', icon: Shield, color: 'text-amber-400' },
  { value: 'admin', labelKey: 'common.roles.admin', icon: Shield, color: 'text-ice-accent' },
  { value: 'member', labelKey: 'common.roles.member', icon: User, color: 'text-ice-text-2' },
  { value: 'viewer', labelKey: 'common.roles.viewer', icon: Eye, color: 'text-ice-text-3' },
];

export function TeamPage() {
  const { t } = useTranslation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const selectedOrg = useSelector((s: RootState) => s.account.selectedOrg);
  const currentUser = useSelector((s: RootState) => s.account.user);
  const callerRole = selectedOrg?.role?.toLowerCase();
  const isAdmin = callerRole === 'owner' || callerRole === 'admin';

  const fetchMembers = useCallback(async () => {
    if (!selectedOrg) return;
    setLoading(true);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        axiosInstance.post('/users', { targetOrganisationId: selectedOrg.id }),
        axiosInstance.get(`/users/invitations?organisationId=${selectedOrg.id}`),
      ]);
      const data = membersRes.data;
      const items = Array.isArray(data) ? data : (data.items ?? []);
      setMembers(
        items.map((u: any) => ({
          id: u.id,
          email: u.email,
          name: u.name || u.email,
          role: (u.role || 'member').toLowerCase(),
          status: 'Active',
          lastLogin: u.lastLogin,
        })),
      );
      setInvites(invitesRes.data);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [selectedOrg]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    // findings.md #52 — defensive guard. Only reachable in theory:
    // the role <select> only renders when isAdmin, and isAdmin
    // derives from selectedOrg.role, so by the time this handler
    // is bound to a button selectedOrg is provably truthy.
    // Kept as a belt-and-braces guard.
    if (!selectedOrg) return;
    setActionLoading(userId);
    try {
      await axiosInstance.post('/users/update-role', {
        userId,
        role: newRole,
        targetOrganisationId: selectedOrg.id,
      });
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role: newRole } : m)));
    } catch {
      /* ignore */
    }
    setActionLoading(null);
  };

  const handleRemoveUser = async (userId: string) => {
    if (!selectedOrg || !window.confirm(t('account.team.removeConfirm'))) return;
    setActionLoading(userId);
    try {
      await axiosInstance.post('/users/remove', {
        userId,
        targetOrganisationId: selectedOrg.id,
      });
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch {
      /* ignore */
    }
    setActionLoading(null);
  };

  const formatDate = (d: string | null) => {
    if (!d) return t('common.time.never');
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getRoleMeta = (role: string) => ORG_ROLES.find((r) => r.value === role) || ORG_ROLES[2];

  return (
    <div id="ice-team-panel" className="mx-auto max-w-4xl px-6 py-10">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ice-text-1">{t('account.team.title')}</h1>
          <p className="mt-1 text-sm text-ice-text-3">
            {t('account.team.subtitle')} {selectedOrg?.name ?? t('account.team.subtitleFallback')}
          </p>
        </div>
        {isAdmin && (
          <button
            id="ice-team-btn-invite"
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 rounded-md bg-ice-accent px-4 py-2 text-sm font-medium text-white hover:bg-ice-accent-hover transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            {t('account.team.inviteButton')}
          </button>
        )}
      </div>

      {/* Members table */}
      <div className="overflow-hidden rounded-lg border border-ice-border bg-ice-raised">
        <div className="grid grid-cols-[1fr_140px_100px_60px] gap-4 border-b border-ice-border bg-ice-surface px-6 py-3">
          <span className="text-xs font-medium uppercase tracking-wider text-ice-text-3">
            {t('account.team.columnMember')}
          </span>
          <span className="text-xs font-medium uppercase tracking-wider text-ice-text-3">
            {t('account.team.columnRole')}
          </span>
          <span className="text-xs font-medium uppercase tracking-wider text-ice-text-3">
            {t('account.team.columnJoined')}
          </span>
          <span />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-ice-text-3" />
          </div>
        )}

        {!loading && members.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-ice-text-3">{t('account.team.emptyState')}</p>
          </div>
        )}

        {!loading &&
          members.map((member) => {
            const isSelf = member.id === currentUser?.id;
            const roleMeta = getRoleMeta(member.role);
            const Icon = roleMeta.icon;

            return (
              <div
                key={member.id}
                className="grid grid-cols-[1fr_140px_100px_60px] gap-4 border-b border-ice-border px-6 py-3 last:border-b-0 hover:bg-ice-surface/50 transition-colors items-center"
              >
                {/* Member info */}
                <div className="min-w-0">
                  <p className="text-sm text-ice-text-1 truncate">
                    {member.name}
                    {isSelf && <span className="text-ice-text-3 ml-1 text-xs">{t('account.team.youBadge')}</span>}
                  </p>
                  <p className="text-xs text-ice-text-3 truncate">{member.email}</p>
                </div>

                {/* Role selector */}
                {isAdmin && !isSelf ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    disabled={actionLoading === member.id}
                    className="text-sm bg-ice-raised border border-ice-border rounded px-2 py-1 text-ice-text-1"
                  >
                    {ORG_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {t(r.labelKey)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={cn('flex items-center gap-1.5 text-sm', roleMeta.color)}>
                    <Icon className="h-3.5 w-3.5" />
                    {t(roleMeta.labelKey)}
                  </span>
                )}

                {/* Joined */}
                <span className="text-sm text-ice-text-3">{formatDate(member.lastLogin)}</span>

                {/* Actions */}
                <div className="flex justify-end">
                  {isAdmin && !isSelf && (
                    <button
                      onClick={() => handleRemoveUser(member.id)}
                      disabled={actionLoading === member.id}
                      className="p-1 rounded text-ice-text-3 hover:text-ice-red hover:bg-ice-hover transition-colors"
                      title={t('account.team.removeTitle')}
                    >
                      {actionLoading === member.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Pending invitations */}
      {invites.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-ice-text-1 mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-ice-text-3" />
            {t('account.team.pendingInvitations')}
          </h2>
          <div className="overflow-hidden rounded-lg border border-ice-border bg-ice-raised">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-4 border-b border-ice-border px-6 py-3 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ice-text-1 truncate">{inv.email}</p>
                  <p className="text-xs text-ice-text-3">
                    {t('account.team.invitedAs')} {inv.role} · {t('account.team.expires')} {formatDate(inv.expires_at)}
                  </p>
                </div>
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {showInviteModal && <InviteUserModal onClose={() => setShowInviteModal(false)} onInvited={fetchMembers} />}
    </div>
  );
}
