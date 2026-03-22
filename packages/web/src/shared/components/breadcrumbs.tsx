/**
 * Universal Breadcrumbs
 *
 * First segment is an org switcher dropdown.
 * Rest auto-generated from URL: Org > Folder > Project > Settings
 */

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight, ChevronDown, Building2, Check, Plus } from 'lucide-react';
import { useResolvePath } from '../hooks/use-resolve-path';
import { setSelectedOrg, type Organisation } from '../../store/slices/account-slice';
import { CreateTeamModal } from '../../features/account/components';
import { toSlug } from '../utils/slug';
import type { RootState, AppDispatch } from '../../store';

const TOP_ROUTES: Record<string, string> = {
  settings: 'Settings',
  team: 'Team',
};

export const Breadcrumbs: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const segments = pathname.split('/').filter(Boolean);
  const selectedOrg = useSelector((s: RootState) => s.account?.selectedOrg);
  const user = useSelector((s: RootState) => s.account?.user);
  const organisations = user?.organisations ?? [];

  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const isTopRoute = segments.length === 1 && TOP_ROUTES[segments[0]];
  const resolved = useResolvePath(isTopRoute ? [] : segments);

  const crumbs: { label: string; path: string }[] = [];

  if (isTopRoute) {
    crumbs.push({ label: TOP_ROUTES[segments[0]], path: pathname });
  } else if (resolved.breadcrumbs.length > 0) {
    crumbs.push(...resolved.breadcrumbs);
  }

  const handleOrgSwitch = (org: Organisation) => {
    dispatch(setSelectedOrg(org));
    navigate(`/${toSlug(org.name)}`);
  };

  return (
    <nav className="flex items-center gap-1 min-w-0">
      {/* Org selector as first breadcrumb */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex items-center gap-1 text-ice-md text-ice-text-3 hover:text-ice-text-1 transition-colors rounded px-1 py-0.5 hover:bg-ice-hover outline-none">
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[140px]">{selectedOrg?.name || 'Select org'}</span>
            <ChevronDown className="w-3 h-3 shrink-0 text-ice-text-3" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-[99999] w-52 rounded-md border border-ice-border bg-ice-overlay p-1 shadow-xl"
          >
            {organisations.map((org) => (
              <DropdownMenu.Item
                key={org.id}
                onClick={() => handleOrgSwitch(org)}
                className="flex items-center gap-2 px-2 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-hover"
              >
                <Building2 className="w-3.5 h-3.5 text-ice-text-3 shrink-0" />
                <span className="flex-1 truncate">{org.name}</span>
                {selectedOrg?.id === org.id && <Check className="w-3.5 h-3.5 text-ice-green shrink-0" />}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="h-px my-1 bg-ice-border" />
            <DropdownMenu.Item
              onClick={() => setShowCreateTeam(true)}
              className="flex items-center gap-2 px-2 py-1.5 text-ice-md text-ice-accent rounded cursor-pointer outline-none hover:bg-ice-hover"
            >
              <Plus className="w-3.5 h-3.5" />
              Create team
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {showCreateTeam && <CreateTeamModal onClose={() => setShowCreateTeam(false)} />}

      {/* Remaining crumbs */}
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.path}>
            <ChevronRight className="h-3 w-3 text-ice-text-3 shrink-0" />
            {isLast ? (
              <span className="text-ice-md text-ice-text-1 font-medium truncate">{crumb.label}</span>
            ) : (
              <Link to={crumb.path} className="text-ice-md text-ice-text-3 hover:text-ice-text-2 transition-colors truncate">
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
