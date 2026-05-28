/**
 * Inline Table View — single row + expandable detail
 *
 * Read-only row presentation. Click selects + opens properties (matches the
 * rest of the app); hover surfaces endpoint links and a row actions menu.
 */

import { Cloud, Copy, ExternalLink, Eye, Globe, MoreHorizontal, Package, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import {
  formatRelativeTime,
  getFamilyColor,
  getSettingsChips,
  providerLabel,
  STATUS_COLORS,
  type Endpoint,
  type EndpointKind,
  type RowStatus,
} from './inline-table-view-helpers';
import { getBrandIcon } from '../../assets/icons/brand-registry';
import { GithubIcon } from '../../features/integrations/components/github-connect-modal';
import { t } from '../../i18n';
import type { CardNode } from '../../store/slices/cards-slice';

// ─── Endpoint icon ──────────────────────────────────────────────────────────

/**
 * Repo endpoints use the devicon GitHub mark (theme-aware via the
 * shared `GithubIcon` wrapper) instead of lucide's outlined icon for
 * brand consistency with the AppBar integrations.
 *
 * The wrapper's `w` / `h` API takes Tailwind size scales (`w-${n}`),
 * not pixels, so we adapt the ENDPOINT_ICON contract (a className-
 * accepting component) by wrapping GithubIcon with default sizing.
 */
const RepoEndpointIcon: React.FC<{ className?: string }> = ({ className }) => (
  <GithubIcon w={4} h={4} className={className} />
);

const ENDPOINT_ICON: Record<EndpointKind, React.ComponentType<{ className?: string }>> = {
  live: Globe,
  domain: Globe,
  repo: RepoEndpointIcon,
  image: Package,
  console: Cloud,
};

const EndpointButton: React.FC<{ ep: Endpoint }> = ({ ep }) => {
  const [copied, setCopied] = useState(false);
  const Icon = ENDPOINT_ICON[ep.kind];

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(ep.url, '_blank', 'noopener,noreferrer');
  };
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(ep.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="group/ep relative inline-flex items-center" title={ep.label}>
      <button
        onClick={open}
        className="flex items-center justify-center w-6 h-6 rounded hover:bg-ice-active text-ice-text-3 hover:text-ice-text-1 transition-colors"
        aria-label={`Open ${ep.kind}: ${ep.label}`}
      >
        <Icon className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={copy}
        className="ml-0.5 flex items-center justify-center w-5 h-5 rounded text-ice-text-3 hover:text-ice-text-1 opacity-0 group-hover/ep:opacity-100 transition-opacity"
        aria-label={`Copy ${ep.kind} URL`}
      >
        <Copy className="w-3 h-3" />
      </button>
      {copied && (
        <span className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-ice-active text-ice-2xs text-ice-text-1 whitespace-nowrap z-10">
          {t('table.endpoints.copied')}
        </span>
      )}
    </div>
  );
};

// ─── Status pill ────────────────────────────────────────────────────────────

const StatusPill: React.FC<{ status: RowStatus }> = ({ status }) => {
  const c = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-ice-2xs font-medium border tabular-nums whitespace-nowrap"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {t(`table.status.${status}`)}
    </span>
  );
};

// ─── Provider cell ──────────────────────────────────────────────────────────

const ProviderCell: React.FC<{ provider: string }> = ({ provider }) => {
  if (!provider) return <span className="text-ice-text-3">—</span>;
  const brand = getBrandIcon(provider);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {brand && <img src={brand.url} alt="" className="w-3.5 h-3.5 shrink-0" />}
      <span className="text-ice-sm text-ice-text-2 truncate">{providerLabel(provider)}</span>
    </div>
  );
};

// ─── Copy-on-click ID ───────────────────────────────────────────────────────

const IdCell: React.FC<{ id: string }> = ({ id }) => {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      onClick={copy}
      title={`${id} — click to copy`}
      className="flex items-center gap-1 min-w-0 text-ice-xs text-ice-text-3 hover:text-ice-text-1 font-mono truncate"
    >
      <span className="truncate">{id}</span>
      <Copy className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover/row:opacity-60" />
      {copied && <span className="text-ice-2xs text-ice-accent ml-1">{t('table.endpoints.copied')}</span>}
    </button>
  );
};

// ─── Row actions menu ───────────────────────────────────────────────────────

interface RowActionsProps {
  endpoints: Endpoint[];
  onCopyId: () => void;
  onCopyName: () => void;
  onRevealOnCanvas: () => void;
  onOpenProperties: () => void;
  onDelete: () => void;
}

const RowActions: React.FC<RowActionsProps> = ({
  endpoints,
  onCopyId,
  onCopyName,
  onRevealOnCanvas,
  onOpenProperties,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = () => close();
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  const live = endpoints.find((e) => e.kind === 'live' || e.kind === 'domain');
  const repo = endpoints.find((e) => e.kind === 'repo');
  const console_ = endpoints.find((e) => e.kind === 'console');

  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger?: boolean) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
        close();
      }}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-ice-xs text-left hover:bg-ice-hover ${
        danger ? 'text-red-400 hover:text-red-300' : 'text-ice-text-2 hover:text-ice-text-1'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-ice-active text-ice-text-3 hover:text-ice-text-1 opacity-0 group-hover/row:opacity-100 data-[open=true]:opacity-100 transition-opacity"
        data-open={open}
        aria-label={t('table.actions.menu')}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded-md border border-ice-border bg-ice-raised shadow-lg py-1">
          {item(<Eye className="w-3.5 h-3.5" />, t('table.actions.openProperties'), onOpenProperties)}
          {item(<ExternalLink className="w-3.5 h-3.5" />, t('table.actions.revealOnCanvas'), onRevealOnCanvas)}
          <div className="my-1 h-px bg-ice-border mx-1" />
          {live &&
            item(<Globe className="w-3.5 h-3.5" />, t('table.actions.openInBrowser'), () =>
              window.open(live.url, '_blank', 'noopener,noreferrer'),
            )}
          {repo &&
            item(<GithubIcon w={3.5} h={3.5} />, t('table.actions.openInGithub'), () =>
              window.open(repo.url, '_blank', 'noopener,noreferrer'),
            )}
          {console_ &&
            item(<Cloud className="w-3.5 h-3.5" />, t('table.actions.openInConsole'), () =>
              window.open(console_.url, '_blank', 'noopener,noreferrer'),
            )}
          {(live || repo || console_) && <div className="my-1 h-px bg-ice-border mx-1" />}
          {item(<Copy className="w-3.5 h-3.5" />, t('table.actions.copyId'), onCopyId)}
          {item(<Copy className="w-3.5 h-3.5" />, t('table.actions.copyName'), onCopyName)}
          <div className="my-1 h-px bg-ice-border mx-1" />
          {item(<Trash2 className="w-3.5 h-3.5" />, t('table.actions.delete'), onDelete, true)}
        </div>
      )}
    </div>
  );
};

// ─── Row ────────────────────────────────────────────────────────────────────

export interface TableRowData {
  node: CardNode;
  label: string;
  typeLabel: string;
  iceType: string;
  provider: string;
  status: RowStatus;
  endpoints: Endpoint[];
  providerId: string;
  region: string;
  updatedAt?: string;
  isChild: boolean;
}

interface RowProps {
  row: TableRowData;
  density: 'compact' | 'comfortable';
  isSelected: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClick: (e: React.MouseEvent) => void;
  onCopyId: () => void;
  onCopyName: () => void;
  onRevealOnCanvas: () => void;
  onOpenProperties: () => void;
  onDelete: () => void;
}

export const InlineTableRow: React.FC<RowProps> = ({
  row,
  density,
  isSelected,
  isExpanded,
  onToggleExpand,
  onClick,
  onCopyId,
  onCopyName,
  onRevealOnCanvas,
  onOpenProperties,
  onDelete,
}) => {
  const accent = getFamilyColor(row.iceType);
  const chips = getSettingsChips(row.node);
  const padY = density === 'compact' ? 'py-1' : 'py-1.5';

  return (
    <>
      <div
        onClick={onClick}
        className={`group/row grid grid-cols-[12px_1fr_140px_110px_120px_140px_180px_90px_36px] items-center gap-2 px-3 ${padY} border-b border-ice-border cursor-pointer transition-colors ${
          isSelected ? 'bg-ice-accent-muted' : 'hover:bg-ice-hover'
        }`}
      >
        {/* color swatch */}
        <span
          className="w-1.5 h-1.5 rounded-full justify-self-center"
          style={{ background: accent, boxShadow: `0 0 0 2px ${accent}22` }}
          title={row.iceType}
        />

        {/* name + expand */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="w-4 h-4 flex items-center justify-center text-ice-text-3 hover:text-ice-text-1 transition-transform"
            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            aria-label={isExpanded ? t('table.expand.hide') : t('table.expand.show')}
          >
            <span className="text-ice-2xs">▶</span>
          </button>
          {row.isChild && <span className="text-ice-text-3 text-ice-2xs">↳</span>}
          <span className="text-ice-md text-ice-text-1 truncate">{row.label}</span>
        </div>

        {/* type */}
        <span className="text-ice-sm text-ice-text-2 font-mono truncate" title={row.iceType}>
          {row.typeLabel}
        </span>

        {/* provider */}
        <ProviderCell provider={row.provider} />

        {/* status */}
        <div>
          <StatusPill status={row.status} />
        </div>

        {/* endpoints */}
        <div className="flex items-center gap-0.5 overflow-hidden">
          {row.endpoints.length === 0 ? (
            <span className="text-ice-2xs text-ice-text-3">—</span>
          ) : (
            row.endpoints.map((ep, i) => <EndpointButton key={`${ep.kind}-${i}`} ep={ep} />)
          )}
        </div>

        {/* id */}
        <div className="min-w-0">
          {row.providerId ? (
            <IdCell id={row.providerId} />
          ) : (
            <span className="text-ice-xs text-ice-text-3 font-mono truncate" title={row.node.id}>
              {row.node.id.slice(0, 12)}…
            </span>
          )}
        </div>

        {/* updated */}
        <span className="text-ice-xs text-ice-text-3 tabular-nums">{formatRelativeTime(row.updatedAt)}</span>

        {/* actions */}
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions
            endpoints={row.endpoints}
            onCopyId={onCopyId}
            onCopyName={onCopyName}
            onRevealOnCanvas={onRevealOnCanvas}
            onOpenProperties={onOpenProperties}
            onDelete={onDelete}
          />
        </div>
      </div>

      {/* expanded detail */}
      {isExpanded && (
        <div className="grid grid-cols-[12px_1fr] gap-2 px-3 py-2 border-b border-ice-border bg-ice-base/40">
          <span />
          <div className="flex flex-wrap gap-1.5">
            {chips.length === 0 ? (
              <span className="text-ice-xs text-ice-text-3 italic">{t('table.expand.noSettings')}</span>
            ) : (
              chips.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-ice-border bg-ice-raised text-ice-2xs"
                >
                  <span className="text-ice-text-3 uppercase tracking-wide">{c.key}</span>
                  <span className="text-ice-text-1 font-mono">{c.value}</span>
                </span>
              ))
            )}
            {row.endpoints.length > 0 && (
              <>
                <span className="w-px self-stretch bg-ice-border mx-1" />
                {row.endpoints.map((ep, i) => (
                  <button
                    key={`exp-ep-${i}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(ep.url, '_blank', 'noopener,noreferrer');
                    }}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-ice-border bg-ice-raised text-ice-2xs text-ice-text-2 hover:text-ice-text-1 hover:border-ice-border-strong"
                    title={ep.url}
                  >
                    {ep.kind === 'repo' ? (
                      <GithubIcon w={3} h={3} />
                    ) : ep.kind === 'image' ? (
                      <Package className="w-3 h-3" />
                    ) : ep.kind === 'console' ? (
                      <Cloud className="w-3 h-3" />
                    ) : (
                      <Globe className="w-3 h-3" />
                    )}
                    <span className="truncate max-w-[260px]">{ep.label}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
