/**
 * Spotlight — Blender-style Shift+A add-block menu.
 *
 * Centered floating modal with a search input, fuzzy-ranked block list,
 * recently-used pinned at the top, and keyboard navigation. Spawning
 * goes through the same blueprint path as palette drag-drop so behavior
 * stays consistent (same default node data, same containment rules,
 * same ghost suggestions).
 *
 * Closing: Escape, click outside, or successful spawn.
 *
 * Implementation note — the search input ref is created once via
 * `useRef` and focused in a `useEffect` rather than via `autoFocus` so
 * it works when the modal re-opens (autoFocus only fires on the
 * initial mount).
 */

import { isIceTypeEnabledForProvider } from '@ice/constants';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { rank, type RankableItem } from './fuzzy-match';
import { resolveSpotlightProvider, buildSpotlightFallbackData } from './spotlight-spawn';
import { getBlueprint, expandBlueprint } from '../../../../config/blocks';
import { useTranslation } from '../../../../i18n';
import { addNodeToCard, expandBlueprintToCard, type CardNode } from '../../../../store/slices/cards-slice';
import { closeSpotlight, pushSpotlightRecent } from '../../../../store/slices/ui-slice';
import { getComponents } from '../../../palette/data/components';
import { getCategoryMap } from '../../../palette/data/categories';
import type { AppDispatch, RootState } from '../../../../store';
import type { ComponentDef } from '../../../palette/types';

type Provider = ComponentDef['providers'][number];

interface SpotlightCommand extends RankableItem {
  type: 'block';
  origin: ComponentDef;
}

export const Spotlight: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { t } = useTranslation();
  const open = useSelector((s: RootState) => s.ui.spotlight.open);
  const canvasPos = useSelector((s: RootState) => ({
    x: s.ui.spotlight.canvasX,
    y: s.ui.spotlight.canvasY,
  }));
  const recent = useSelector((s: RootState) => s.ui.spotlight.recentTypes);
  const deployProvider = useSelector((s: RootState) => s.deploy.provider);

  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build the searchable command list from the same palette source so
  // a block added there is automatically findable here.
  const commands = useMemo<SpotlightCommand[]>(() => {
    const components = getComponents(t);
    return components.map((c) => ({
      type: 'block',
      origin: c,
      name: c.name,
      description: c.description,
      iceType: c.type,
      category: c.category,
    }));
  }, [t]);

  // CD8 — show the same localized, palette category labels (not the raw
  // iceType category id) so the spotlight reads like the palette.
  const categoryMap = useMemo(() => getCategoryMap(t), [t]);

  // Order: when no query, surface recently-used at the top, then
  // everything else in palette order; with a query, fuzzy-rank.
  // `recentCount` marks the recent/catalog boundary so the list can show
  // lightweight section headers (CD8) without affecting keyboard nav (which
  // indexes `ranked`, a flat command list with no header rows).
  const { ranked, recentCount } = useMemo<{ ranked: SpotlightCommand[]; recentCount: number }>(() => {
    if (!query.trim()) {
      const recentSet = new Set(recent);
      const fromRecent = recent
        .map((iceType) => commands.find((c) => c.iceType === iceType))
        .filter((c): c is SpotlightCommand => !!c);
      const rest = commands.filter((c) => !recentSet.has(c.iceType));
      return { ranked: [...fromRecent, ...rest], recentCount: fromRecent.length };
    }
    return { ranked: rank(commands, query), recentCount: 0 };
  }, [commands, query, recent]);

  // Reset state when the modal opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlightIdx(0);
      // Microtask delay so Radix/portal mounting completes before focus.
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // Clamp highlight into bounds when ranked list shrinks.
  useEffect(() => {
    if (highlightIdx >= ranked.length) setHighlightIdx(Math.max(0, ranked.length - 1));
  }, [ranked.length, highlightIdx]);

  const spawn = (cmd: SpotlightCommand): void => {
    const blockType = cmd.iceType;
    // CD1 — prefer the active deploy provider when this block supports it, so
    // Shift+A spawns the same blueprint the drag path would (was: always [0]).
    const { effectiveProvider, gateBlocked } = resolveSpotlightProvider(
      blockType,
      cmd.origin.providers,
      deployProvider,
      isIceTypeEnabledForProvider,
    );
    const blueprint = gateBlocked ? undefined : getBlueprint(blockType, effectiveProvider);

    if (blueprint) {
      const expanded = expandBlueprint(blueprint, {
        position: canvasPos,
        provider: effectiveProvider as Provider,
      });
      dispatch(expandBlueprintToCard(expanded));
    } else if (blockType === 'Util.Reroute') {
      // Reroute is a tiny pass-through dot, not a deployable resource —
      // it has no blueprint by design. Spawn a minimal 16×16 node.
      const newNode: CardNode = {
        id: `reroute-${Date.now()}`,
        type: 'resource',
        position: { x: canvasPos.x - 8, y: canvasPos.y - 8 },
        width: 16,
        height: 16,
        data: {
          label: '',
          iceType: blockType,
          behavior: 'singleton',
          folded: false,
        },
      };
      dispatch(addNodeToCard(newNode));
    } else {
      // Fall through to a bare resource node so the user still gets a
      // visible placeholder when the blueprint is missing for the active
      // provider. Mirrors the palette drop fallback — CD5: carries
      // `providerUnsupported` so the warning badge + deploy validator flag it.
      const newNode: CardNode = {
        id: `node-${Date.now()}`,
        type: 'resource',
        position: { x: canvasPos.x, y: canvasPos.y },
        width: 200,
        height: 120,
        data: buildSpotlightFallbackData({ name: cmd.name, iceType: blockType }, effectiveProvider, gateBlocked),
      };
      dispatch(addNodeToCard(newNode));
    }
    dispatch(pushSpotlightRecent(blockType));
    dispatch(closeSpotlight());
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dispatch(closeSpotlight());
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(ranked.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = ranked[highlightIdx];
      if (cmd) spawn(cmd);
    }
  };

  if (!open) return null;

  return (
    <div
      id="ice-spotlight-backdrop"
      data-testid="spotlight-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) dispatch(closeSpotlight());
      }}
      onKeyDown={onKey}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '20vh',
        background: 'rgba(0,0,0,0.18)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        id="ice-spotlight"
        data-testid="spotlight"
        style={{
          width: 460,
          maxWidth: '90vw',
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--ice-bg-raised)',
          border: '1px solid var(--ice-border)',
          borderRadius: 10,
          boxShadow: '0 10px 40px -10px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.12)',
          overflow: 'hidden',
          fontFamily: "'JetBrains Mono Variable', monospace",
        }}
      >
        <input
          ref={inputRef}
          id="ice-spotlight-input"
          data-testid="spotlight-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add block…"
          style={{
            padding: '12px 14px',
            fontSize: 14,
            background: 'transparent',
            color: 'var(--ice-text-primary)',
            border: 'none',
            outline: 'none',
            borderBottom: '1px solid var(--ice-border-subtle, var(--ice-border))',
          }}
        />
        <ul
          data-testid="spotlight-list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '4px 0',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {ranked.length === 0 && (
            <li
              style={{
                padding: '12px 14px',
                color: 'var(--ice-text-tertiary)',
                fontSize: 12,
              }}
            >
              No matches.
            </li>
          )}
          {ranked.map((cmd, i) => {
            // CD8 — lightweight section headers split recently-used from the
            // full catalog (only when not searching). Header <li>s are not in
            // `ranked`, so they don't affect arrow-key navigation.
            const showHeaders = !query.trim() && recentCount > 0;
            return (
              <React.Fragment key={cmd.iceType}>
                {showHeaders && i === 0 && <SpotlightHeader label={t('canvas.spotlight.recent')} />}
                {showHeaders && i === recentCount && <SpotlightHeader label={t('canvas.spotlight.catalog')} />}
                <SpotlightRow
                  cmd={cmd}
                  categoryLabel={(cmd.category && categoryMap.get(cmd.category)?.label) || cmd.category || ''}
                  highlighted={i === highlightIdx}
                  onSelect={() => spawn(cmd)}
                  onHover={() => setHighlightIdx(i)}
                />
              </React.Fragment>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

// CD8 — non-interactive group label (Recent / All blocks).
export const SpotlightHeader: React.FC<{ label: string }> = ({ label }) => (
  <li
    aria-hidden="true"
    style={{
      padding: '8px 14px 4px',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: 'var(--ice-text-tertiary)',
      pointerEvents: 'none',
    }}
  >
    {label}
  </li>
);

interface SpotlightRowProps {
  cmd: SpotlightCommand;
  /** CD8 — localized palette category label (not the raw iceType category id). */
  categoryLabel: string;
  highlighted: boolean;
  onSelect: () => void;
  onHover: () => void;
}

export const SpotlightRow: React.FC<SpotlightRowProps> = ({ cmd, categoryLabel, highlighted, onSelect, onHover }) => {
  const Icon = cmd.origin.icon;
  return (
    <li
      data-testid={`spotlight-row-${cmd.iceType}`}
      data-highlighted={highlighted}
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        cursor: 'pointer',
        background: highlighted ? 'var(--ice-bg-hover)' : 'transparent',
      }}
    >
      <Icon size={16} style={{ color: 'var(--ice-text-secondary)', flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--ice-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {cmd.name}
        </span>
        {cmd.description && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--ice-text-tertiary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {cmd.description}
          </span>
        )}
      </div>
      <span style={{ fontSize: 10, color: 'var(--ice-text-tertiary)', fontVariant: 'all-small-caps' }}>
        {categoryLabel}
      </span>
    </li>
  );
};
