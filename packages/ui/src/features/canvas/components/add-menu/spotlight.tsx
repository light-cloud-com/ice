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
import { getBlueprint, expandBlueprint } from '../../../../config/blocks';
import { useTranslation } from '../../../../i18n';
import { addNodeToCard, expandBlueprintToCard, type CardNode } from '../../../../store/slices/cards-slice';
import { closeSpotlight, pushSpotlightRecent } from '../../../../store/slices/ui-slice';
import { getComponents } from '../../../palette/data/components';
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

  // Order: when no query, surface recently-used at the top, then
  // everything else in palette order; with a query, fuzzy-rank.
  const ranked = useMemo<SpotlightCommand[]>(() => {
    if (!query.trim()) {
      const recentSet = new Set(recent);
      const fromRecent = recent
        .map((iceType) => commands.find((c) => c.iceType === iceType))
        .filter((c): c is SpotlightCommand => !!c);
      const rest = commands.filter((c) => !recentSet.has(c.iceType));
      return [...fromRecent, ...rest];
    }
    return rank(commands, query);
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
    const paletteProvider: Provider | undefined = cmd.origin.providers[0];
    const effectiveProvider = paletteProvider ?? deployProvider;
    const gateBlocked = !!effectiveProvider && !isIceTypeEnabledForProvider(blockType, effectiveProvider);
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
      // provider. Mirrors the palette drop fallback.
      const newNode: CardNode = {
        id: `node-${Date.now()}`,
        type: 'resource',
        position: { x: canvasPos.x, y: canvasPos.y },
        width: 200,
        height: 120,
        data: {
          label: cmd.name,
          iceType: blockType,
          behavior: 'singleton',
          folded: false,
          provider: deployProvider,
        },
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
          {ranked.map((cmd, i) => (
            <SpotlightRow
              key={cmd.iceType}
              cmd={cmd}
              highlighted={i === highlightIdx}
              onSelect={() => spawn(cmd)}
              onHover={() => setHighlightIdx(i)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
};

interface SpotlightRowProps {
  cmd: SpotlightCommand;
  highlighted: boolean;
  onSelect: () => void;
  onHover: () => void;
}

const SpotlightRow: React.FC<SpotlightRowProps> = ({ cmd, highlighted, onSelect, onHover }) => {
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
        {cmd.category}
      </span>
    </li>
  );
};
