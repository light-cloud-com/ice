/**
 * SvgEnvConfigNode — Read-only canvas renderer for `Config.Environment`.
 *
 * Shows the configured KEY=value pairs. Values ARE rendered here because
 * Env Config holds non-sensitive config only (secrets belong in Secret
 * Store). Editing moves to the properties panel.
 */

import { Cog } from 'lucide-react';
import React from 'react';
import { CardShell, EmptyHint, KvLine } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const EC_HEADER_HEIGHT = 48;
export const EC_ROW_HEIGHT = 20;
export const EC_PADDING = 12;

export function computeEnvConfigHeight(data: Record<string, unknown>): number {
  const rows = (data?.variables as unknown[] | undefined) || [];
  const rowCount = Math.max(rows.length, 1);
  return EC_HEADER_HEIGHT + EC_PADDING + rowCount * EC_ROW_HEIGHT + EC_PADDING;
}

interface EnvVar {
  key: string;
  value: string;
}

function parseVariable(raw: unknown): EnvVar {
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return { key: String(obj.key ?? ''), value: String(obj.value ?? '') };
  }
  if (typeof raw === 'string') {
    const eq = raw.indexOf('=');
    if (eq > 0) return { key: raw.slice(0, eq), value: raw.slice(eq + 1) };
    return { key: raw, value: '' };
  }
  return { key: '', value: '' };
}

export const SvgEnvConfigNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
}) => {
  const variables: EnvVar[] = ((node.data?.variables as unknown[] | undefined) || [])
    .map(parseVariable)
    .filter((v) => v.key);

  const subtitle = variables.length > 0
    ? `${variables.length} ${variables.length === 1 ? 'variable' : 'variables'}`
    : 'No variables yet';

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      icon={Cog}
      title={node.label || 'Env Config'}
      subtitle={subtitle}
      headerHeight={EC_HEADER_HEIGHT}
    >
      {variables.length === 0 ? (
        <EmptyHint message="edit in properties →" />
      ) : (
        variables.map((v, i) => <KvLine key={i} name={v.key} value={v.value} />)
      )}
    </CardShell>
  );
};

SvgEnvConfigNode.displayName = 'SvgEnvConfigNode';
