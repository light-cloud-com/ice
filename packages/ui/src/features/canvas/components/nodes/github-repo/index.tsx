/**
 * SvgGithubRepoNode — Read-only canvas renderer for `Source.Repository`.
 *
 * Body surfaces the repository address front-and-centre — that's the
 * piece of data a user expects to see on a source block at a glance
 * (which repo is this thing? which branch?). When no repo is connected
 * yet, an empty-state hint replaces the URL so the block reads as
 * "needs setup" rather than blank. Build / deploy settings live in the
 * status footer. Validated block — visuals change, schema preserved.
 */

import { CARD_FOOTER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_HEADER_HEIGHT, COMPUTE_PADDING } from '@ice/constants';
import { GitBranch } from 'lucide-react';
import React from 'react';
import { getBrandIcon } from '../../../../../assets/icons/brand-registry';
import { t } from '../../../../../i18n';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { COMPUTE_HEADER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_PADDING };

export function computeGithubRepoHeight(): number {
  return COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
}

const REPO_ACCENT = '#8b5cf6';

/**
 * Normalise whatever the user typed (or whatever the integration wrote)
 * into the canonical `owner/repo` shape. Strips https://github.com/,
 * trailing `.git`, and a trailing slash so the body's URL row reads
 * consistently regardless of input format.
 */
export function normaliseRepoIdentifier(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, '');
  s = s.replace(/\.git$/i, '');
  s = s.replace(/\/+$/, '');
  return s;
}

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const buildCmd = (data?.buildCommand as string) || '';
  const autoDeploy = data?.autoDeploy;
  const parts = [
    autoDeploy === false ? t('canvas.blocks.github.manualDeploys') : t('canvas.blocks.github.autoDeploy'),
    buildCmd ? `${t('canvas.blocks.github.buildPrefix')}${buildCmd}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

const BranchTag: React.FC<{ branch: string; color: string }> = ({ branch, color }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 7px',
      borderRadius: 10,
      background: `${color}18`,
      border: `1px solid ${color}55`,
      fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
      fontSize: 10,
      color: 'var(--ice-text-1)',
      flexShrink: 0,
    }}
  >
    <svg width={9} height={9} viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M 2.5 1 L 2.5 9 M 7.5 1 L 7.5 5 M 2.5 5 Q 5 5 7.5 5"
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <circle cx={2.5} cy={1} r={1} fill={color} />
      <circle cx={7.5} cy={1} r={1} fill={color} />
      <circle cx={2.5} cy={9} r={1} fill={color} />
    </svg>
    <span>{branch}</span>
  </div>
);

export const SvgGithubRepoNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const repository = normaliseRepoIdentifier((node.data?.repository as string) || (node.data?.repo as string) || '');
  const branch = (node.data?.branch as string) || 'main';
  const path = (node.data?.path as string) || '/';
  const liveConfig = buildLiveConfig(node.data);

  // Title is the user-friendly label. The repo address lives in the
  // body where there's room for the full `github.com/owner/repo` form.
  const title = node.label || t('canvas.blocks.titles.githubRepo');

  // GitHub mark for the body (left-aligned). Resolved at the consumer
  // so we control size/placement; CardShell receives `brandOverride`
  // only so the zoomed-out LOD shows it next to the generic icon.
  const githubBrand = getBrandIcon('github');

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      lod={lod}
      pipelineStatus={pipelineStatus}
      icon={GitBranch}
      // Pass the GitHub brand identity so the zoomed-out LOD shows the
      // GitHub mark next to the generic GitBranch icon. At full LOD the
      // brand renders inline in the body (below) — header stays generic
      // per the project's "type first, brand second" rule.
      brandOverride="github"
      accentColor={REPO_ACCENT}
      title={title}
      liveConfig={liveConfig}
      headerHeight={COMPUTE_HEADER_HEIGHT}
    >
      <div
        style={{
          height: COMPUTE_BODY_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 0,
        }}
        data-testid={`repo-body-${node.id}`}
      >
        {/* GitHub brand mark on the left — anchors the block's identity
            without taking over the header. Falls back to nothing when
            the brand registry doesn't have a github asset (e.g. SSR'd
            test environment), keeping the rest of the body untouched. */}
        {githubBrand?.url && (
          <img
            src={githubBrand.url}
            alt={githubBrand.label}
            width={36}
            height={36}
            draggable={false}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            data-testid={`repo-brand-${node.id}`}
          />
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            justifyContent: 'center',
            minWidth: 0,
            flex: 1,
          }}
        >
          {/* Repository address — the headline piece of data on a source block. */}
          {repository ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                fontSize: 12,
                color: 'var(--ice-text-1)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              data-testid={`repo-address-${node.id}`}
              title={`github.com/${repository}`}
            >
              <span style={{ color: 'var(--ice-text-tertiary)', opacity: 0.7 }}>github.com/</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{repository}</span>
            </div>
          ) : (
            <span
              style={{
                fontSize: 11,
                fontStyle: 'italic',
                color: 'var(--ice-text-tertiary)',
                opacity: 0.7,
              }}
              data-testid={`repo-empty-${node.id}`}
            >
              {t('canvas.blocks.github.noRepoConnected')}
            </span>
          )}
          {/* Branch + path row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <BranchTag branch={branch} color={REPO_ACCENT} />
            <span
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                color: 'var(--ice-text-2)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                opacity: 0.85,
              }}
              data-testid={`repo-path-${node.id}`}
              title={path}
            >
              {path}
            </span>
          </div>
        </div>
      </div>
    </CardShell>
  );
};

SvgGithubRepoNode.displayName = 'SvgGithubRepoNode';
