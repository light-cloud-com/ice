/**
 * Concept Info Modal
 *
 * Tabbed dialog opened from the (i) icon on a high-level concept block.
 * Shows Overview (markdown), Compiles To (per-provider raw primitives),
 * Code snippets (6 languages), and external Links.
 */

import {
  getInfoContent,
  SNIPPET_LANGUAGES,
  SNIPPET_LANGUAGE_LABELS,
  type InfoContent,
  type RawPrimitive,
  type SnippetLanguage,
  Provider,
} from '@ice/blocks';
import React, { useMemo, useState } from 'react';
import { useTranslation } from '../../i18n';
import { renderMarkdown } from './markdown';

type Tab = 'overview' | 'compiles' | 'snippets' | 'links';

interface ConceptInfoModalProps {
  iceType: string;
  displayName: string;
  /** Currently selected target provider, if any. Used as default for the Compiles To tab. */
  currentProvider?: Provider;
  onClose: () => void;
}

export const ConceptInfoModal: React.FC<ConceptInfoModalProps> = ({
  iceType,
  displayName,
  currentProvider,
  onClose,
}) => {
  const content: InfoContent | undefined = useMemo(() => getInfoContent(iceType), [iceType]);
  const [tab, setTab] = useState<Tab>('overview');
  const { t } = useTranslation();

  if (!content) return null;

  const allTabs: readonly { id: Tab; label: string; show: boolean }[] = [
    { id: 'overview' as const, label: t('canvas.infoModal.tabOverview'), show: true },
    {
      id: 'compiles' as const,
      label: t('canvas.infoModal.tabCompiles'),
      show: !!content.compilesTo && Object.keys(content.compilesTo).length > 0,
    },
    {
      id: 'snippets' as const,
      label: t('canvas.infoModal.tabCode'),
      show: !!content.snippets && Object.keys(content.snippets).length > 0,
    },
    {
      id: 'links' as const,
      label: t('canvas.infoModal.tabLinks'),
      show: !!content.links && content.links.length > 0,
    },
  ];
  const availableTabs = allTabs.filter((t) => t.show);

  // Stop every mouse event so nothing bubbles back to the canvas (which
  // uses mousedown for pan/drag and click for selection). The modal is
  // portaled to document.body, but React still propagates synthetic events
  // through the virtual tree to the parent that rendered it.
  const stopAll = (e: React.SyntheticEvent) => e.stopPropagation();
  const backdropProps = {
    onMouseDown: stopAll,
    onMouseUp: stopAll,
    onPointerDown: stopAll,
    onPointerUp: stopAll,
    onWheel: stopAll,
    onContextMenu: stopAll,
  };
  const panelProps = {
    ...backdropProps,
    onClick: stopAll,
    onDoubleClick: stopAll,
    onKeyDown: stopAll,
    onKeyUp: stopAll,
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.65)' }}
      onClick={onClose}
      {...backdropProps}
    >
      <div
        className="rounded-lg overflow-hidden flex flex-col"
        style={{
          background: 'var(--ice-bg-base)',
          border: '1px solid var(--ice-border)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
          width: 720,
          maxWidth: '90vw',
          height: 560,
          maxHeight: '85vh',
        }}
        {...panelProps}
      >
        {/* Header */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--ice-border)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold" style={{ color: 'var(--ice-text-primary)' }}>
              {displayName}
            </span>
            <span className="text-ice-sm font-mono" style={{ color: 'var(--ice-text-tertiary)' }}>
              {iceType}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-base leading-none w-6 h-6 rounded flex items-center justify-center"
            style={{ color: 'var(--ice-text-tertiary)' }}
            aria-label={t('canvas.infoModal.close')}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3" style={{ borderBottom: '1px solid var(--ice-border)' }}>
          {availableTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-2 text-ice-sm font-medium"
              style={{
                color: tab === t.id ? 'var(--ice-text-primary)' : 'var(--ice-text-tertiary)',
                borderBottom: `2px solid ${tab === t.id ? 'var(--ice-border-strong)' : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {tab === 'overview' && <OverviewTab content={content} />}
          {tab === 'compiles' && <CompilesTab content={content} currentProvider={currentProvider} />}
          {tab === 'snippets' && <SnippetsTab content={content} />}
          {tab === 'links' && <LinksTab content={content} />}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Overview tab
// =============================================================================

const OverviewTab: React.FC<{ content: InfoContent }> = ({ content }) => {
  const { locale } = useTranslation();
  const markdown =
    locale === 'zh' && content.overview.markdownZh
      ? content.overview.markdownZh
      : content.overview.markdown;
  return (
    <div
      className="text-ice-sm prose-custom"
      style={{ color: 'var(--ice-text-secondary)', lineHeight: 1.6 }}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
    />
  );
};

// =============================================================================
// Compiles To tab
// =============================================================================

const CompilesTab: React.FC<{ content: InfoContent; currentProvider?: Provider }> = ({ content, currentProvider }) => {
  const { t } = useTranslation();
  const providers = Object.keys(content.compilesTo ?? {}) as Provider[];
  const [selected, setSelected] = useState<Provider>(
    currentProvider && providers.includes(currentProvider) ? currentProvider : providers[0],
  );

  if (!content.compilesTo || providers.length === 0) {
    return (
      <div className="text-ice-sm" style={{ color: 'var(--ice-text-tertiary)' }}>
        {t('canvas.infoModal.noInfrastructure')}
      </div>
    );
  }

  const primitives: RawPrimitive[] = content.compilesTo[selected] ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-ice-sm" style={{ color: 'var(--ice-text-tertiary)' }}>
          {t('canvas.infoModal.providerLabel')}
        </span>
        <div className="flex gap-1">
          {providers.map((p) => (
            <button
              key={p}
              onClick={() => setSelected(p)}
              className="px-2 py-1 text-ice-xs rounded font-medium uppercase"
              style={{
                background: selected === p ? 'var(--ice-border-strong)' : 'transparent',
                color: selected === p ? 'var(--ice-text-primary)' : 'var(--ice-text-tertiary)',
                border: '1px solid var(--ice-border)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {primitives.map((p, i) => (
          <div
            key={`${p.type}-${i}`}
            className="rounded px-3 py-2 flex flex-col gap-0.5"
            style={{
              background: 'var(--ice-bg-raised)',
              border: '1px solid var(--ice-border)',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-ice-sm font-semibold" style={{ color: 'var(--ice-text-primary)' }}>
                {p.name}
              </span>
              {p.optional && (
                <span
                  className="text-ice-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: 'var(--ice-bg-base)',
                    color: 'var(--ice-text-tertiary)',
                    border: '1px solid var(--ice-border)',
                  }}
                >
                  {t('canvas.infoModal.optional')}
                </span>
              )}
            </div>
            <span className="text-ice-xs font-mono" style={{ color: 'var(--ice-text-tertiary)' }}>
              {p.type}
            </span>
            {p.role && (
              <span className="text-ice-xs" style={{ color: 'var(--ice-text-secondary)' }}>
                {p.role}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// Snippets tab
// =============================================================================

const SnippetsTab: React.FC<{ content: InfoContent }> = ({ content }) => {
  const { t } = useTranslation();
  const availableLangs: SnippetLanguage[] = SNIPPET_LANGUAGES.filter((l) => content.snippets && content.snippets[l]);
  const [lang, setLang] = useState<SnippetLanguage>(availableLangs[0] ?? 'ts');

  if (availableLangs.length === 0) {
    return (
      <div className="text-ice-sm" style={{ color: 'var(--ice-text-tertiary)' }}>
        {t('canvas.infoModal.noSnippets')}
      </div>
    );
  }

  const code = content.snippets?.[lang] ?? '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {availableLangs.map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className="px-2.5 py-1 text-ice-xs rounded font-medium"
            style={{
              background: lang === l ? 'var(--ice-border-strong)' : 'transparent',
              color: lang === l ? 'var(--ice-text-primary)' : 'var(--ice-text-tertiary)',
              border: '1px solid var(--ice-border)',
            }}
          >
            {SNIPPET_LANGUAGE_LABELS[l]}
          </button>
        ))}
      </div>

      <pre
        className="p-3 rounded overflow-auto text-ice-sm"
        style={{
          background: 'var(--ice-bg-raised)',
          border: '1px solid var(--ice-border)',
          color: 'var(--ice-text-primary)',
          fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
          whiteSpace: 'pre',
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
};

// =============================================================================
// Links tab
// =============================================================================

const LinksTab: React.FC<{ content: InfoContent }> = ({ content }) => {
  const { locale } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {content.links?.map((link, i) => {
        const label =
          locale === 'zh' && content.linksZh && content.linksZh[i]
            ? content.linksZh[i]
            : link.label;
        return (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ice-sm px-3 py-2 rounded block"
            style={{
              color: 'var(--ice-text-primary)',
              background: 'var(--ice-bg-raised)',
              border: '1px solid var(--ice-border)',
              textDecoration: 'none',
            }}
          >
            {label} <span style={{ color: 'var(--ice-text-tertiary)' }}>↗</span>
          </a>
        );
      })}
    </div>
  );
};
