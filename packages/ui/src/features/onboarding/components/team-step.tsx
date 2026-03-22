/**
 * Onboarding Step 2 — Create or Join Team
 *
 * Two paths: create a new team, or join an existing one (if invited).
 * Creating a team is the default — team name is required.
 */

import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Users, UserPlus } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';
import { setTeamMode, setTeamName } from '../../../store/slices/onboarding-slice';
import type { RootState, AppDispatch } from '../../../store';

const TEAM_OPTIONS = [
  {
    id: 'create' as const,
    icon: Users,
    title: 'Create a team',
    description: 'Set up a new team workspace',
  },
  {
    id: 'join' as const,
    icon: UserPlus,
    title: 'Join a team',
    description: 'You were invited by a team admin',
  },
];

export const TeamStep: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const teamMode = useSelector((s: RootState) => s.onboarding.teamMode);
  const teamName = useSelector((s: RootState) => s.onboarding.teamName);
  const [inviteCode, setInviteCode] = useState('');

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-ice-text-1">Set up your team</h2>
        <p className="text-sm text-ice-text-2 mt-1">Every project belongs to a team</p>
      </div>

      {/* Team mode selection */}
      <div className="space-y-2">
        {TEAM_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = teamMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => dispatch(setTeamMode(opt.id))}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-all',
                isSelected
                  ? 'border-ice-accent bg-ice-accent/5 ring-1 ring-ice-accent/30'
                  : 'border-ice-border bg-ice-surface hover:border-ice-text-3',
              )}
            >
              <Icon className={cn('mt-0.5 w-4 h-4 shrink-0', isSelected ? 'text-ice-accent' : 'text-ice-text-2')} />
              <div>
                <p className="text-sm font-medium text-ice-text-1">{opt.title}</p>
                <p className="text-xs text-ice-text-2 mt-0.5">{opt.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Create team — name input */}
      {teamMode === 'create' && (
        <div>
          <label className="block text-sm font-medium text-ice-text-2 mb-1.5">Team name</label>
          <input
            id="ice-onboarding-team-input-name"
            type="text"
            value={teamName}
            onChange={(e) => dispatch(setTeamName(e.target.value))}
            placeholder="My Team"
            className="ice-input w-full"
            autoFocus
          />
        </div>
      )}

      {/* Join team — invite code */}
      {teamMode === 'join' && (
        <div>
          <label className="block text-sm font-medium text-ice-text-2 mb-1.5">Invite code</label>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Paste your invite code or link"
            className="ice-input w-full"
            autoFocus
          />
          <p className="text-xs text-ice-text-3 mt-1">Ask your team admin for an invite code or link.</p>
        </div>
      )}
    </div>
  );
};
