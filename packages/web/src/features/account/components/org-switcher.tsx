/**
 * OrgSwitcher — compact org dropdown for top bar
 */

import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Building2, ChevronDown, Plus, Check } from 'lucide-react';
import type { RootState, AppDispatch } from '@/store';
import { setSelectedOrg, type Organisation } from '@/store/slices/account-slice';
import { CreateTeamModal } from './create-team-modal';

export function OrgSwitcher() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.account.user);
  const selectedOrg = useSelector((s: RootState) => s.account.selectedOrg);
  const organisations = user?.organisations ?? [];

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex items-center gap-1.5 px-2 py-1 rounded text-ice-md text-ice-text-2 hover:text-ice-text-1 hover:bg-ice-hover transition-colors outline-none">
            <Building2 className="h-3.5 w-3.5" />
            <span className="max-w-[120px] truncate">{selectedOrg?.name ?? 'Select team'}</span>
            <ChevronDown className="h-3 w-3 text-ice-text-3" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-[99999] w-56 rounded-md border border-ice-border bg-ice-overlay p-1 shadow-xl"
          >
            <DropdownMenu.Label className="px-2 py-1.5 text-ice-sm font-semibold text-ice-text-3 uppercase tracking-widest">
              Teams
            </DropdownMenu.Label>

            {organisations.map((org) => (
              <DropdownMenu.Item
                key={org.id}
                onClick={() => dispatch(setSelectedOrg(org))}
                className="flex items-center gap-2 px-2 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active"
              >
                <Building2 className="h-3.5 w-3.5 text-ice-text-3 shrink-0" />
                <span className="flex-1 truncate">{org.name}</span>
                {selectedOrg?.id === org.id && <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />}
              </DropdownMenu.Item>
            ))}

            {organisations.length === 0 && (
              <div className="px-2 py-3 text-ice-md text-ice-text-3 text-center">No teams yet</div>
            )}

            <DropdownMenu.Separator className="h-px my-1 bg-ice-active" />

            <DropdownMenu.Item
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-2 py-1.5 text-ice-md text-blue-400 rounded cursor-pointer outline-none hover:bg-ice-active"
            >
              <Plus className="h-3.5 w-3.5" />
              Create team
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {showCreateModal && <CreateTeamModal onClose={() => setShowCreateModal(false)} />}
    </>
  );
}
