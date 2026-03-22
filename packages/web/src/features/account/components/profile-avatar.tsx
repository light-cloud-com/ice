/**
 * ProfileAvatar — compact avatar with Radix dropdown
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Settings, Users, LogOut } from 'lucide-react';
import type { RootState, AppDispatch } from '@/store';
import { clearUser } from '@/store/slices/account-slice';
import { logout, setAccessToken } from '@/shared/api/auth';

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return email ? email[0].toUpperCase() : '?';
}

export function ProfileAvatar() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.account.user);

  const handleLogout = useCallback(async () => {
    try { await logout(); } catch { /* best-effort */ }
    setAccessToken('');
    dispatch(clearUser());
    navigate('/login');
  }, [dispatch, navigate]);

  const initials = getInitials(user?.name, user?.email);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          id="ice-appbar-btn-profile"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-ice-hover text-ice-sm font-medium text-ice-text-2 hover:bg-ice-active transition-colors outline-none"
          aria-label="User menu"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            initials
          )}
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
            <p className="text-ice-md font-medium text-ice-text-1 truncate">{user?.name || 'User'}</p>
            <p className="text-ice-sm text-ice-text-3 truncate">{user?.email || ''}</p>
          </div>

          <div className="p-1">
            <DropdownMenu.Item
              onClick={() => navigate('/settings')}
              className="flex items-center gap-2 px-2 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active hover:text-ice-text-1"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onClick={() => navigate('/team')}
              className="flex items-center gap-2 px-2 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active hover:text-ice-text-1"
            >
              <Users className="h-3.5 w-3.5" />
              Team
            </DropdownMenu.Item>
          </div>

          <DropdownMenu.Separator className="h-px bg-ice-active" />

          <div className="p-1">
            <DropdownMenu.Item
              onClick={handleLogout}
              className="flex items-center gap-2 px-2 py-1.5 text-ice-md text-red-400/80 rounded cursor-pointer outline-none hover:bg-red-500/10 hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
