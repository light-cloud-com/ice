/**
 * ProfileAvatar — compact avatar with Radix dropdown (Community edition)
 */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Settings, Users } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../../i18n';
import type { RootState } from '../../../store';

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return email ? email[0].toUpperCase() : '?';
}

export function ProfileAvatar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSelector((s: RootState) => s.account.user);

  const initials = getInitials(user?.name, user?.email);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          id="ice-appbar-btn-profile"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-ice-hover text-ice-sm font-medium text-ice-text-2 hover:bg-ice-active transition-colors outline-none"
          aria-label={t('account.avatar.ariaLabel')}
        >
          {user?.avatar ? <img src={user.avatar} alt="" className="h-7 w-7 rounded-full object-cover" /> : initials}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[99999] w-52 rounded-md border border-ice-border bg-ice-overlay shadow-xl"
        >
          {/* User info */}
          <div className="border-b border-ice-border px-3 py-2.5">
            <p className="text-ice-md font-medium text-ice-text-1 truncate">{user?.name || t('account.avatar.defaultName')}</p>
            <p className="text-ice-sm text-ice-text-3 truncate">{user?.email || ''}</p>
          </div>

          <div className="p-1">
            <DropdownMenu.Item
              onClick={() => navigate('/settings')}
              className="flex items-center gap-2 px-2 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active hover:text-ice-text-1"
            >
              <Settings className="h-3.5 w-3.5" />
              {t('account.avatar.settings')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onClick={() => navigate('/team')}
              className="flex items-center gap-2 px-2 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active hover:text-ice-text-1"
            >
              <Users className="h-3.5 w-3.5" />
              {t('account.avatar.team')}
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
