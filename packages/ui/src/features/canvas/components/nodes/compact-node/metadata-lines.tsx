import React, { memo, useState } from 'react';
import { isPlaceholder } from './helpers';
import { useTranslation } from '../../../../../i18n';
import { RepoSelector } from '../../../../integrations/components/repo-selector';
import { FONT_MONO } from '../_shared/fonts';

interface MetadataLinesProps {
  metaLines: string[];
  repoLineIndex: number;
  isSelected: boolean;
  isHovered: boolean;
  isSourceRepo: boolean;
  repository: string;
  nodeId: string;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
}

export const MetadataLines: React.FC<MetadataLinesProps> = memo(
  ({ metaLines, repoLineIndex, isSelected, isHovered, isSourceRepo, repository, nodeId, onUpdateData }) => {
    const { t } = useTranslation();
    const [repoSelectorOpen, setRepoSelectorOpen] = useState(false);

    return (
      <div style={{ marginTop: 2, flex: 1, minHeight: 0 }}>
        {metaLines.map((line, i) => {
          const isRepoLine = i === repoLineIndex;
          const isPh = isPlaceholder(line);

          if (isRepoLine && isSelected && isSourceRepo) {
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    color: 'var(--ice-text-secondary)',
                    fontSize: 11,
                    fontFamily: FONT_MONO,
                    opacity: isHovered ? 0.85 : 0.7,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRepoSelectorOpen(!repoSelectorOpen);
                  }}
                >
                  {line}
                </span>
                {isHovered && (
                  <span
                    style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--ice-text-secondary)', cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRepoSelectorOpen(!repoSelectorOpen);
                    }}
                  >
                    ✎
                  </span>
                )}
              </div>
            );
          }

          return (
            <div
              key={i}
              style={{
                color: isPh ? 'var(--ice-text-tertiary)' : 'var(--ice-text-secondary)',
                fontSize: 11,
                fontFamily: FONT_MONO,
                fontStyle: isPh ? 'italic' : 'normal',
                opacity: isPh ? 0.45 : 0.75,
                lineHeight: '17px',
              }}
            >
              {isPh ? line.slice(1) : line}
            </div>
          );
        })}

        {/* Link repo prompt */}
        {!repository && isSelected && isHovered && isSourceRepo && (
          <span
            style={{ color: '#3b82f6', fontSize: 9, fontFamily: FONT_MONO, opacity: 0.7, cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              setRepoSelectorOpen(true);
            }}
          >
            {t('integrations.repoSelector.linkRepo')}
          </span>
        )}

        {/* Repo selector */}
        {repoSelectorOpen && isSelected && isSourceRepo && (
          <div style={{ marginTop: 2 }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <RepoSelector
              compact
              value={repository}
              onChange={(repo) => {
                onUpdateData?.(nodeId, { repository: repo });
                setRepoSelectorOpen(false);
              }}
            />
          </div>
        )}
      </div>
    );
  },
);

MetadataLines.displayName = 'MetadataLines';
